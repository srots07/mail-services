import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyCore, lightEditProblems, nameParts, validatePersonalization } from "@/lib/ai/personalization";
import { parseModelOutput } from "@/lib/ai/schema";
import { sheetToParsed } from "@/lib/csv/parse";
import { isValidEmail, sanitizeCell } from "@/lib/csv/validate";
import { computeSchedule, continueFrom, resolveStart, retryStart } from "@/lib/queue/schedule";

const PEOPLE = [
  { email: "priya.shah@acme.io", name: "Priya Shah", company: "Acme Robotics Inc." },
  { email: "liam@brightpath.co", name: "Liam O'Connor", company: "BrightPath Learning" },
  { email: "sofia@verdefarms.mx", name: "Sofia Hernandez", company: "Verde Farms" },
  { email: "noah@northwind.dev", name: "Noah Fischer", company: "Northwind Analytics" },
  { email: "elena@bluepeak.eu", name: "Elena Rossi", company: "BluePeak Energy GmbH" },
];

describe("Excel (.xlsx) sheets", () => {
  it("turns a sheet into headers + rows like a CSV (empty rows dropped, dates and numbers as text)", () => {
    const p = sheetToParsed([
      ["Email", "Name", "Joined", "Score", ""],
      ["a@x.io", "Ann", new Date("2026-10-01T00:00:00Z"), 42, null],
      [null, null, null, null, null],
      ["b@x.io", null, null, null, null],
    ]);
    assert.deepEqual(p.headers, ["Email", "Name", "Joined", "Score"]);
    assert.deepEqual(p.rows, [
      { Email: "a@x.io", Name: "Ann", Joined: "2026-10-01", Score: "42" },
      { Email: "b@x.io", Name: "", Joined: "", Score: "" },
    ]);
  });
});

describe("cell and email validation", () => {
  it("accepts normal addresses and rejects malformed ones", () => {
    assert.equal(isValidEmail("priya.shah@acme.io"), true);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail("a..b@x.io"), false);
    assert.equal(isValidEmail("a@x.c"), false);
  });

  it("strips control characters, normalises line endings and caps length", () => {
    assert.equal(sanitizeCell(" a\u0000b\r\nc ", 100), "ab\nc");
    assert.equal(sanitizeCell("abcdef", 3), "abc");
    assert.equal(sanitizeCell(null, 10), "");
  });
});

describe("Generated output validation", () => {
  const peers = PEOPLE.map((p, i) => ({ id: String(i), ...p }));
  const self = (i: number) => ({ id: String(i), email: PEOPLE[i].email, name: PEOPLE[i].name, company: PEOPLE[i].company, suppliedText: "Met at ProMat 2026" });
  const good = {
    subject: "Warehouse pilot for Acme Robotics",
    body: "Dear Priya,\n\nIt was great meeting you at ProMat 2026. I would love to discuss a warehouse automation pilot at Acme Robotics in Q3.\n\nBest regards,\nJordan Lee",
  };

  it("accepts a correctly personalised email (company suffix normalised)", () => {
    assert.deepEqual(validatePersonalization(good, self(0), peers).problems, []);
    assert.equal(companyCore("BluePeak Energy GmbH"), "BluePeak Energy");
    assert.equal(nameParts("Dr. Priya Shah").first, "Priya");
  });

  it("rejects empty subject/body, the wrong name and a missing company", () => {
    assert.equal(validatePersonalization({ subject: "", body: good.body }, self(0), peers).ok, false);
    assert.equal(validatePersonalization({ subject: good.subject, body: " " }, self(0), peers).ok, false);
    assert.ok(validatePersonalization({ ...good, body: good.body.replace("Priya", "there") }, self(0), peers).problems.some((p) => p.includes("name")));
    assert.ok(validatePersonalization({ subject: "Pilot", body: good.body.replace("at Acme Robotics ", "") }, self(0), peers).problems.some((p) => p.includes("company")));
  });

  it("rejects placeholders", () => {
    assert.ok(validatePersonalization({ ...good, body: `${good.body}\n[COMPANY]` }, self(0), peers).problems.some((p) => p.includes("placeholder")));
    assert.equal(parseModelOutput('{"subject":"Hello [NAME]","body":"' + "x".repeat(60) + '"}').ok, false);
  });

  it("detects another recipient's name, company or email", () => {
    assert.ok(validatePersonalization({ ...good, body: `${good.body}\nP.S. Liam O'Connor says hi.` }, self(0), peers).problems.some((p) => p.includes("another recipient")));
    assert.ok(validatePersonalization({ ...good, body: `${good.body}\nLike we did for Verde Farms.` }, self(0), peers).problems.some((p) => p.includes("Verde Farms")));
    assert.ok(validatePersonalization({ ...good, body: `${good.body}\nCC noah@northwind.dev` }, self(0), peers).problems.some((p) => p.includes("noah@northwind.dev")));
  });

  it("allows a peer's company when this contact's own data mentions it", () => {
    const s = { ...self(0), suppliedText: "Introduced by Northwind Analytics" };
    assert.deepEqual(validatePersonalization({ ...good, body: `${good.body}\nNorthwind Analytics suggested I reach out.` }, s, peers).problems, []);
  });

  it("flags a body that the AI padded with new paragraphs", () => {
    const original = "Hi Rahul,\n\nI wanted to share a short introduction to our reporting automation.\n\nWould you be open to a call?\n\nRegards,\nSam";
    assert.deepEqual(lightEditProblems(original, original.replace("Rahul", "Priya").replace("Sam", "Jordan Lee")), []);
    const padded = `${original}\n\n${"We also run a warehouse pilot in Q3 with 20% faster picking and offices in Chicago. ".repeat(2)}`;
    assert.equal(lightEditProblems(original, padded).length, 1);
  });
});

describe("Scheduling", () => {
  it("7 recipients at a 1 minute interval are scheduled at +0..+6 minutes", () => {
    const times = computeSchedule(new Date("2026-10-06T09:00:00.000Z"), 60, 7);
    assert.deepEqual(
      times.map((t) => t.toISOString()),
      ["09:00", "09:01", "09:02", "09:03", "09:04", "09:05", "09:06"].map((hm) => `2026-10-06T${hm}:00.000Z`),
    );
  });

  it("supports second-level intervals", () => {
    assert.deepEqual(computeSchedule(new Date(0), 15, 3).map((t) => t.getTime()), [0, 15_000, 30_000]);
  });

  it("resolves the start time and rejects times in the past", () => {
    const now = new Date("2026-10-06T09:00:00Z");
    assert.equal(resolveStart({ startMode: "now" }, now).getTime(), now.getTime());
    assert.equal(resolveStart({ startMode: "at", startAt: "2026-10-06T10:30:00Z" }, now).toISOString(), "2026-10-06T10:30:00.000Z");
    assert.equal(resolveStart({ startMode: "at", startAt: "2026-10-06T08:59:30Z" }, now).getTime(), now.getTime(), "small clock skew is tolerated");
    assert.throws(() => resolveStart({ startMode: "at", startAt: "2026-10-06T08:00:00Z" }, now));
  });

  it("resume never schedules in the past and retries go after the current schedule", () => {
    const now = new Date("2026-10-06T09:10:00Z");
    assert.equal(continueFrom(new Date("2026-10-06T09:03:00Z"), now).getTime(), now.getTime());
    assert.equal(continueFrom(new Date("2026-10-06T09:20:00Z"), now).toISOString(), "2026-10-06T09:20:00.000Z");
    assert.equal(retryStart(new Date("2026-10-06T09:20:00Z"), 60, now).toISOString(), "2026-10-06T09:21:00.000Z");
    assert.equal(retryStart(null, 60, now).getTime(), now.getTime());
  });
});
