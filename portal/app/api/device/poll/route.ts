import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { issueLicense } from "@/lib/license";
import { clientIp, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({ deviceCode: z.string().min(20).max(200) });

class Taken extends Error {}

/** Desktop app polls until the code is approved, then collects its device credentials exactly once. */
export const POST = handle(async (request: Request) => {
  rateLimit(`device-poll:${clientIp(request)}`, 120, 60_000);
  const { deviceCode } = body.parse(await readJson(request));
  const row = await db().deviceCode.findUnique({ where: { deviceCodeHash: sha256(deviceCode) } });
  if (!row || row.expiresAt < new Date() || row.deviceId) return json({ status: "expired" });
  if (!row.approvedByUserId) return json({ status: "pending" });

  const user = await db().user.findUniqueOrThrow({ where: { id: row.approvedByUserId }, include: { subscription: true } });
  const deviceSecret = randomToken(32);
  let deviceId: string;
  try {
    deviceId = await db().$transaction(async (tx) => {
      const active = await tx.device.count({ where: { userId: user.id, revokedAt: null } });
      if (active >= env().MAX_DEVICES) throw new Taken("limit");
      const device = await tx.device.create({ data: { userId: user.id, name: row.deviceName, secretHash: sha256(deviceSecret) } });
      const claimed = await tx.deviceCode.updateMany({ where: { id: row.id, deviceId: null }, data: { deviceId: device.id } });
      if (claimed.count !== 1) throw new Taken("taken");
      return device.id;
    });
  } catch (err) {
    if (err instanceof Taken) return json({ status: err.message === "limit" ? "device_limit" : "expired" });
    throw err;
  }

  return json({
    status: "approved",
    deviceId,
    deviceSecret,
    email: user.email,
    license: issueLicense(user, user.subscription, deviceId),
  });
});
