import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { evaluateLicense, verifyLicenseToken } from "@/lib/license-verify";
import { buildPayload, publicKeyFromPrivate, signLicense } from "../portal/lib/license-core";
import { entitlement, mergePatch, patchForEvent, type SubscriptionLike } from "../portal/lib/subscription";

function keyPair() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  return { priv, pub: publicKeyFromPrivate(priv) };
}

const DAY = 86_400_000;
const now = new Date("2026-10-07T12:00:00Z");
const keys = keyPair();

function license(kind: "trial" | "paid" | "none", entitledUntil: Date | null, issued = now) {
  return signLicense(buildPayload({ userId: "u1", email: "a@b.co", deviceId: "d1", kind, entitledUntil, now: issued }), keys.priv);
}

describe("Desktop license verification", () => {
  it("accepts a paid license and reports the end date", () => {
    const s = evaluateLicense(license("paid", new Date(now.getTime() + 20 * DAY)), keys.pub, now);
    assert.equal(s.state, "active");
    assert.equal(s.canSend, true);
    assert.equal(s.email, "a@b.co");
  });

  it("reports a trial as trial", () => {
    const s = evaluateLicense(license("trial", new Date(now.getTime() + 3 * DAY)), keys.pub, now);
    assert.equal(s.state, "trial");
    assert.equal(s.canSend, true);
  });

  it("locks sending once the paid period ends, even while the license is fresh", () => {
    const token = license("paid", new Date(now.getTime() + DAY));
    assert.equal(evaluateLicense(token, keys.pub, new Date(now.getTime() + 2 * DAY)).state, "expired");
    assert.equal(evaluateLicense(license("none", null), keys.pub, now).canSend, false);
  });

  it("locks sending when the license was not refreshed for 7 days", () => {
    const token = license("paid", new Date(now.getTime() + 60 * DAY));
    const s = evaluateLicense(token, keys.pub, new Date(now.getTime() + 7 * DAY + 1000));
    assert.equal(s.state, "offline");
    assert.equal(s.canSend, false);
  });

  it("rejects tampered tokens and tokens signed by another key", () => {
    const token = license("trial", new Date(now.getTime() + DAY));
    const [body, sig] = token.split(".");
    const forged = Buffer.from(body, "base64url").toString("utf8").replace('"trial"', '"paid"');
    assert.equal(verifyLicenseToken(`${Buffer.from(forged).toString("base64url")}.${sig}`, keys.pub), null);
    assert.equal(evaluateLicense(token, keyPair().pub, now).state, "invalid");
    assert.equal(evaluateLicense("garbage", keys.pub, now).state, "invalid");
    assert.equal(evaluateLicense(null, keys.pub, now).state, "missing");
  });
});

describe("Subscription entitlement", () => {
  const sub = (s: Partial<SubscriptionLike>): SubscriptionLike => ({ status: "TRIAL", plan: null, trialEndsAt: null, currentPeriodEnd: null, ...s });

  it("covers the trial, then nothing", () => {
    const trial = sub({ trialEndsAt: new Date(now.getTime() + DAY) });
    assert.deepEqual(entitlement(trial, now), { active: true, kind: "trial", until: trial.trialEndsAt });
    assert.equal(entitlement(trial, new Date(now.getTime() + 2 * DAY)).active, false);
  });

  it("keeps a cancelled subscription until its period end and gives failed renewals a grace period", () => {
    const end = new Date(now.getTime() + 5 * DAY);
    assert.equal(entitlement(sub({ status: "CANCELLED", currentPeriodEnd: end }), now).active, true);
    assert.equal(entitlement(sub({ status: "CANCELLED", currentPeriodEnd: end }), new Date(end.getTime() + 1)).active, false);
    const pastDue = sub({ status: "PAST_DUE", currentPeriodEnd: now });
    assert.equal(entitlement(pastDue, new Date(now.getTime() + 2 * DAY)).active, true);
    assert.equal(entitlement(pastDue, new Date(now.getTime() + 4 * DAY)).active, false);
  });

  it("an expired (halted) subscription is not entitled even with a future trial date", () => {
    assert.equal(entitlement(sub({ status: "EXPIRED", trialEndsAt: new Date(now.getTime() + DAY) }), now).active, false);
  });

  it("maps Razorpay events and never shortens a granted period", () => {
    const later = Math.floor((now.getTime() + 30 * DAY) / 1000);
    assert.deepEqual(patchForEvent("subscription.charged", { id: "s", current_end: later }), {
      status: "ACTIVE",
      currentPeriodEnd: new Date(later * 1000),
      cancelAtPeriodEnd: false,
    });
    assert.equal(patchForEvent("subscription.halted", { id: "s" })?.status, "EXPIRED");
    assert.equal(patchForEvent("payment.captured", { id: "s" }), null);

    const current = sub({ status: "ACTIVE", currentPeriodEnd: new Date(later * 1000) });
    const stale = mergePatch(current, { status: "PENDING", currentPeriodEnd: now });
    assert.deepEqual(stale, {});
  });
});
