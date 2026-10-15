import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBulkPrompt, bulkBodyProblems, bulkLeakProblems, bulkSubjectProblems, extractBulkContext, extractBulkField, NOT_AVAILABLE } from "@/lib/ai/bulk-email";
import { autoMapBulkColumns, BULK_HEADER_ALIASES, sanitizeBulkMapping } from "@/lib/bulk/fields";
import { detectPlaceholders, hasSenderPlaceholders, leftoverPlaceholders, renderBulkEmail, senderSignature, withSignature, type BulkSender } from "@/lib/bulk/placeholders";
import { bulkRowStatus } from "@/lib/bulk/status";
import { BULK_STEPS, isBulkStep, nextBulkStep } from "@/lib/bulk/steps";
import { validateBulkRows } from "@/lib/bulk/validate";
import { pdfPagesToRows, type TextPiece } from "@/lib/csv/pdf";
import { composeOutgoing } from "@/lib/email/compose";
import { buildMimeMessage } from "@/lib/email/mime";
import { isValidTimeZone, zonedDateTimeToUtc } from "@/lib/queue/schedule";
import { bulkCheckSchema, bulkSendSchema, bulkSettingsSchema, ccEmailsSchema, recipientEmailSchema } from "@/lib/validation/bulk";

const MAPPING = { company_name: "company_name", to_name: "to_name", from_name: "from_name", email: "email" };

const SENDER: BulkSender = {
  senderName: "Subhash Rao",
  designation: "Director, Test Solutions",
  companyName: "Acme ATE",
  email: "subhash@acme-ate.example",
  phone: "+91 98450 00000",
  website: "https://acme-ate.example",
};

const SIGNATURE = "Subhash Rao\nDirector, Test Solutions\nAcme ATE\n+91 98450 00000 | subhash@acme-ate.example\nhttps://acme-ate.example";

const BODY = `Hi [To Name],

I lead test solutions at Acme. We help teams like [Company Name] cut SLT time.

- AI-driven ATE pattern optimisation
- SLT yield analytics

Could we talk this week?

Best regards,`;

describe("contact file mapping and validation", () => {
  it("maps the four columns, including common aliases", () => {
    assert.deepEqual(autoMapBulkColumns(["Company", "To Name", "From", "Mail ID", "City"]), {
      company_name: "Company",
      to_name: "To Name",
      from_name: "From",
      email: "Mail ID",
    });
    assert.deepEqual(autoMapBulkColumns(["company_name", "customer_name", "email_id"]), { company_name: "company_name", to_name: "customer_name", from_name: "", email: "email_id" });
    assert.deepEqual(sanitizeBulkMapping({ to_name: "nope", company_name: "company" }, ["company"]), { company_name: "company", to_name: "", from_name: "", email: "" });
  });

  it("reports errors, warnings and duplicates, and keeps other columns as extra details", () => {
    const rows = [
      { company_name: "Nova Semi", to_name: "Priya Shah", from_name: "Subhash", email: " Priya@Nova.example ", city: "Pune" },
      { company_name: "Blank Co", to_name: "", from_name: "Subhash", email: "a@blank.example", city: "" },
      { company_name: "", to_name: "Ravi", from_name: "Subhash", email: "ravi@x.example", city: "" },
      { company_name: "Bad Co", to_name: "Bad Mail", from_name: "Subhash", email: "not-an-email", city: "" },
      { company_name: "Other", to_name: "Dup Mail", from_name: "Subhash", email: "priya@nova.example", city: "" },
      { company_name: "Quiet Labs", to_name: "No Mail", from_name: "Subhash", email: "", city: "" },
      { company_name: "Orbit", to_name: "Liam", from_name: "", email: "liam@orbit.example", city: "" },
      { company_name: "Orbit", to_name: "Liam", from_name: "", email: "liam@orbit.example", city: "" },
    ];
    const { rows: out, summary } = validateBulkRows(rows, MAPPING);
    assert.equal(out[0].email, "priya@nova.example");
    assert.equal(out[0].fromName, "Subhash");
    assert.deepEqual(out[0].extra, { city: "Pune" });
    assert.deepEqual(out[0].errors, []);
    assert.match(out[1].errors.join(), /To name is empty/);
    assert.match(out[2].errors.join(), /Company name is empty/);
    assert.match(out[3].errors.join(), /Invalid email format/);
    assert.match(out[4].errors.join(), /Duplicate email \(also on row 2\)/);
    assert.match(out[5].errors.join(), /Email is empty/);
    assert.match(out[6].warnings.join(), /From name is empty/);
    assert.match(out[7].errors.join(), /Duplicate of row 8/);
    assert.equal(summary.total, 8);
    assert.equal(summary.invalid, 6);
    assert.equal(summary.valid, 2);
    assert.equal(summary.duplicateEmails, 1);
    assert.equal(summary.duplicateRows, 1);
    assert.equal(summary.withWarnings, 2);
  });

  it("does not warn about from name when the file has no from column", () => {
    const { rows } = validateBulkRows([{ c: "Nova", n: "Priya", e: "p@nova.example" }], { company_name: "c", to_name: "n", from_name: "", email: "e" });
    assert.deepEqual(rows[0].errors, []);
    assert.deepEqual(rows[0].warnings, []);
  });
});

describe("contacts from a PDF", () => {
  const piece = (x: number, y: number, str: string): TextPiece => ({ x, y, width: str.length * 5, height: 10, str });

  it("reads a table under recognised headers", () => {
    const page = [
      piece(10, 700, "Company Name"),
      piece(150, 700, "To Name"),
      piece(260, 700, "From Name"),
      piece(370, 700, "Email"),
      piece(10, 680, "Nova Semi"),
      piece(150, 680, "Priya Shah"),
      piece(260, 680, "Subhash"),
      piece(370, 680, "priya@nova.example"),
      piece(10, 660, "Orbit Devices"),
      piece(150, 660, "Liam Chen"),
      piece(370, 660, "liam@orbit.example"),
    ];
    const parsed = pdfPagesToRows([page], BULK_HEADER_ALIASES);
    assert.deepEqual(parsed.headers, ["Company Name", "To Name", "From Name", "Email"]);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0]["Email"], "priya@nova.example");
    assert.equal(parsed.rows[1]["From Name"], "");
    assert.deepEqual(autoMapBulkColumns(parsed.headers), { company_name: "Company Name", to_name: "To Name", from_name: "From Name", email: "Email" });
  });

  it("falls back to lines with an email and rejects scanned PDFs", () => {
    const parsed = pdfPagesToRows([[piece(10, 700, "Nova Semi"), piece(150, 700, "priya@nova.example"), piece(10, 680, "Just a title")]], BULK_HEADER_ALIASES);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]["Column 2"], "priya@nova.example");
    assert.throws(() => pdfPagesToRows([[]], BULK_HEADER_ALIASES), /no selectable text/);
  });
});

describe("placeholders and the sender signature", () => {
  const recipient = { customerName: "Priya Shah", companyName: "Nova Semi" };

  it("fills placeholders, keeps the format and adds the signature after the sign-off", () => {
    const r = renderBulkEmail({ body: BODY, subjectTemplate: "AI ATE & SLT for [Company Name]", recipient, sender: SENDER });
    assert.deepEqual(r.problems, []);
    assert.equal(r.subject, "AI ATE & SLT for Nova Semi");
    assert.equal(r.body, `${BODY.replace("[To Name]", "Priya Shah").replace("[Company Name]", "Nova Semi")}\n${SIGNATURE}`);
    assert.deepEqual(leftoverPlaceholders(r.body), []);
  });

  it("uses the row's from name in the signature and leaves a gap when there is no sign-off", () => {
    assert.equal(senderSignature(SENDER, "Anita"), SIGNATURE.replace("Subhash Rao", "Anita"));
    assert.equal(withSignature("Hello there.\n", SENDER), `Hello there.\n\n${SIGNATURE}`);
    assert.equal(senderSignature({ senderName: "Solo", designation: null, companyName: null, email: null, phone: null, website: null }), "Solo");
    const r = renderBulkEmail({ body: "Hi [To Name], from [From Name]", subjectTemplate: "x", recipient: { ...recipient, fromName: "Anita" }, sender: SENDER });
    assert.ok(r.body.startsWith("Hi Priya Shah, from Anita"));
  });

  it("does not add a second signature when the body already has sender placeholders", () => {
    const body = "Hi [To Name],\n\nThanks,\n[Your Name]\n[Phone] | [Email]";
    assert.equal(hasSenderPlaceholders(body), true);
    assert.equal(hasSenderPlaceholders(BODY), false);
    const r = renderBulkEmail({ body, subjectTemplate: "x", recipient, sender: SENDER });
    assert.equal(r.body, "Hi Priya Shah,\n\nThanks,\nSubhash Rao\n+91 98450 00000 | subhash@acme-ate.example");
  });

  it("flags unsupported and empty placeholders instead of guessing", () => {
    const r = renderBulkEmail({ body: "Hi [To Name], see [Budget]. [Designation]", subjectTemplate: "Hello", recipient, sender: { ...SENDER, designation: null } });
    assert.match(r.problems.join(), /Unsupported placeholder \[Budget\]/);
    assert.match(r.problems.join(), /Sender designation is not set/);
    const empty = renderBulkEmail({ body: " ", subjectTemplate: " ", recipient, sender: SENDER });
    assert.match(empty.problems.join(), /body is empty/);
    assert.match(empty.problems.join(), /subject is empty/);
  });

  it("detects placeholders with their meaning", () => {
    const found = detectPlaceholders("[To Name] [Your Name] [Foo] [Customer Name] [From Name]");
    assert.equal(found.length, 5);
    assert.equal(found.find((f) => f.token === "[Foo]")?.key, null);
    assert.equal(found.find((f) => f.token === "[To Name]")?.key, "customer");
    assert.equal(found.find((f) => f.token === "[From Name]")?.key, "fromName");
  });

  it("uses the same signature for every row and never mixes recipients", () => {
    const people = [
      { customerName: "Priya Shah", companyName: "Nova Semi" },
      { customerName: "Liam Chen", companyName: "Orbit Devices" },
      { customerName: "Ana Ruiz", companyName: "Delta Fab" },
    ];
    const out = people.map((p) => renderBulkEmail({ body: BODY, subjectTemplate: "Hi [Company Name]", recipient: p, sender: SENDER }));
    assert.ok(out.every((o) => o.body.endsWith(SIGNATURE)));
    out.forEach((o, i) => {
      assert.ok(o.body.includes(people[i].customerName));
      for (const [j, other] of people.entries()) {
        if (j === i) continue;
        assert.ok(!o.body.includes(other.customerName), `row ${i} leaked ${other.customerName}`);
        assert.ok(!o.subject.includes(other.companyName));
      }
    });
  });
});

describe("AI checks", () => {
  const rendered = renderBulkEmail({ body: BODY, subjectTemplate: "x", recipient: { customerName: "Priya Shah", companyName: "Nova Semi" }, sender: SENDER }).body;

  it("accepts the unchanged body and rejects structural changes", () => {
    assert.deepEqual(bulkBodyProblems(rendered, rendered), []);
    assert.match(bulkBodyProblems(rendered, rendered.replace("- SLT yield analytics\n", "")).join(), /bullet/);
    assert.match(bulkBodyProblems(rendered, `${rendered}\n\nP.S. We also offer a free audit to every customer this quarter.`).join(), /paragraphs/);
    assert.match(bulkBodyProblems(rendered, rendered.replace("Nova Semi", "[Company Name]")).join(), /Unreplaced placeholders/);
  });

  it("validates subjects", () => {
    assert.deepEqual(bulkSubjectProblems("Cutting SLT time at Nova Semi"), []);
    assert.match(bulkSubjectProblems("").join(), /empty/);
    assert.match(bulkSubjectProblems("Hello [Company Name]").join(), /placeholders/);
  });

  it("detects another recipient leaking into AI output", () => {
    const peers = [
      { id: "a", email: "priya@nova.example", name: "Priya Shah", company: "Nova Semi" },
      { id: "b", email: "liam@orbit.example", name: "Liam Chen", company: "Orbit Devices" },
    ];
    const self = { id: "a", name: "Priya Shah", company: "Nova Semi", renderedBody: rendered };
    assert.deepEqual(bulkLeakProblems({ subject: "Nova Semi SLT", body: rendered }, self, peers), []);
    assert.match(bulkLeakProblems({ subject: "Orbit Devices and Nova Semi", body: rendered }, self, peers).join(), /another recipient/);
  });

  it("allows a peer's email that is already in the sender's body or signature", () => {
    const signed = `${rendered}\n\nBest regards,\nSubhan\n0852 | subhan@verilumen.example`;
    const peers = [
      { id: "a", email: "ganesh@nova.example", name: "Ganesh", company: "Nova Semi" },
      { id: "b", email: "subhan@verilumen.example", name: "Subhan", company: "TechVantage Labs" },
    ];
    const self = { id: "a", name: "Ganesh", company: "Nova Semi", renderedBody: signed };
    assert.deepEqual(bulkLeakProblems({ subject: "Nova Semi SLT", body: signed }, self, peers), []);
    assert.match(bulkLeakProblems({ subject: "Nova Semi SLT", body: `${signed}\nCC liam@orbit.example` }, self, [...peers, { id: "c", email: "liam@orbit.example", name: "Liam", company: "Orbit" }]).join(), /liam@orbit\.example/);
  });

  it("gives the AI the contact's row details and marks missing ones NOT_AVAILABLE", () => {
    const p = buildBulkPrompt({ renderedBody: rendered, fixedSubject: null, aiBody: true, instructions: null, customerName: "Priya Shah", companyName: "Nova Semi", fromName: null, extra: { City: "Pune" } });
    const ctx = extractBulkContext(p.user);
    assert.equal(ctx.to_name, "Priya Shah");
    assert.equal(ctx.company_name, "Nova Semi");
    assert.equal(ctx.from_name, NOT_AVAILABLE);
    assert.equal(ctx.City, "Pune");
    assert.match(p.user, /Personalisation: ENABLED/);
    assert.equal(extractBulkField(p.user, "rendered_body"), rendered);
    assert.equal(extractBulkField(p.user, "fixed_subject"), "");
  });
});

describe("outgoing message", () => {
  it("uses the row's from name, then the sender name, as the From display name", () => {
    const account = { email: "me@gmail.example", displayName: "Account Name" };
    const email = { subject: "S", body: "B" };
    assert.deepEqual(composeOutgoing({ account, contact: { email: "priya@nova.example", fromPersonName: "Anita" }, email, senderName: "Subhash Rao" }).from, { email: "me@gmail.example", name: "Anita" });
    assert.equal(composeOutgoing({ account, contact: { email: "x@y.example", fromPersonName: null }, email, senderName: "Subhash Rao" }).from.name, "Subhash Rao");
    assert.equal(composeOutgoing({ account, contact: { email: "x@y.example", fromPersonName: null }, email }).from.name, "Account Name");
  });

  it("copies the CC list on every email, without the To address", () => {
    const msg = composeOutgoing({
      account: { email: "me@gmail.example", displayName: null },
      contact: { email: "priya@nova.example", fromPersonName: null },
      email: { subject: "S", body: "B" },
      cc: ["boss@acme.example", "Priya@Nova.example", "team@acme.example"],
    });
    assert.equal(msg.to, "priya@nova.example");
    assert.deepEqual(msg.cc, ["boss@acme.example", "team@acme.example"]);
    const mime = buildMimeMessage(msg);
    assert.match(mime, /\r\nTo: priya@nova\.example\r\n/);
    assert.match(mime, /\r\nCc: boss@acme\.example, team@acme\.example\r\n/);
    assert.doesNotMatch(buildMimeMessage({ ...msg, cc: [] }), /\r\nCc:/);
    assert.throws(() => buildMimeMessage({ ...msg, cc: ["bad\r\nBcc: x@y.example"] }), /Invalid CC address/);
  });
});

describe("row status", () => {
  const base = { status: "READY", approvalStatus: "PENDING", hasEmail: true, hasDraft: true, blocked: false };
  it("maps database state to one display status", () => {
    assert.equal(bulkRowStatus(base), "READY");
    assert.equal(bulkRowStatus({ ...base, approvalStatus: "APPROVED" }), "APPROVED");
    assert.equal(bulkRowStatus({ ...base, blocked: true }), "INVALID");
    assert.equal(bulkRowStatus({ ...base, hasEmail: false }), "INVALID");
    assert.equal(bulkRowStatus({ ...base, approvalStatus: "REJECTED" }), "REJECTED");
    assert.equal(bulkRowStatus({ ...base, status: "NEW", hasDraft: false }), "DRAFT");
    assert.equal(bulkRowStatus({ ...base, status: "SCHEDULED", approvalStatus: "APPROVED" }), "QUEUED");
    assert.equal(bulkRowStatus({ ...base, status: "SENT", approvalStatus: "APPROVED" }), "SENT");
    assert.equal(bulkRowStatus({ ...base, status: "FAILED", approvalStatus: "APPROVED" }), "FAILED");
  });
});

describe("scheduling in a chosen time zone", () => {
  it("converts wall-clock time in a zone to UTC", () => {
    assert.equal(zonedDateTimeToUtc("2026-10-20", "10:00", "Asia/Kolkata").toISOString(), "2026-10-20T04:30:00.000Z");
    assert.equal(zonedDateTimeToUtc("2026-07-01", "09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(zonedDateTimeToUtc("2026-12-01", "09:00", "America/New_York").toISOString(), "2026-12-01T14:00:00.000Z");
    assert.equal(zonedDateTimeToUtc("2026-01-15", "23:30", "UTC").toISOString(), "2026-01-15T23:30:00.000Z");
  });

  it("rejects unknown zones and malformed input", () => {
    assert.equal(isValidTimeZone("Europe/Berlin"), true);
    assert.equal(isValidTimeZone("Mars/Base"), false);
    assert.throws(() => zonedDateTimeToUtc("2026-01-01", "10:00", "Mars/Base"), RangeError);
    assert.throws(() => zonedDateTimeToUtc("01/02/2026", "10:00", "UTC"), RangeError);
    assert.throws(() => zonedDateTimeToUtc("2026-01-01", "25:00", "UTC"), RangeError);
  });
});

describe("request schemas", () => {
  it("keeps omitted settings unchanged and clears empty ones", () => {
    const p = bulkSettingsSchema.parse({ subjectTemplate: "" });
    assert.equal(p.aiInstructions, undefined);
    assert.equal(p.ccEmails, undefined);
    assert.equal(p.subjectTemplate, null);
  });

  it("accepts cells and AI instructions with more than 5000 characters", () => {
    const longText = "A".repeat(12000);
    const parsed = bulkCheckSchema.parse({
      headers: ["Company", "Email", "Notes"],
      rows: [{ Company: "Acme", Email: "test@example.com", Notes: longText }],
    });
    assert.equal(parsed.rows[0].Notes.length, 12000);

    const s = bulkSettingsSchema.parse({ aiInstructions: "B".repeat(6000) });
    assert.equal(s.aiInstructions?.length, 6000);
  });

  it("normalises the CC list and rejects bad addresses", () => {
    assert.deepEqual(ccEmailsSchema.parse([" Boss@Acme.example ", "boss@acme.example", "team@acme.example"]), ["boss@acme.example", "team@acme.example"]);
    assert.throws(() => ccEmailsSchema.parse(["not-an-email"]));
    assert.throws(() => ccEmailsSchema.parse(Array.from({ length: 11 }, (_, i) => `u${i}@acme.example`)));
  });

  it("validates the final send request and a corrected address", () => {
    const s = bulkSendSchema.parse({ confirmText: "APPROVE & SEND ALL" });
    assert.equal(s.startMode, "now");
    assert.equal(s.intervalSeconds, 30);
    assert.throws(() => bulkSendSchema.parse({ confirmText: "x", intervalSeconds: 0 }));
    assert.deepEqual(recipientEmailSchema.parse({ email: " Sales@Nova.Example " }), { email: "sales@nova.example" });
  });

  it("orders the seven wizard steps", () => {
    assert.deepEqual(
      BULK_STEPS.map((s) => s.slug),
      ["contacts", "template", "sender", "generate", "review", "send", "results"],
    );
    assert.equal(isBulkStep("review"), true);
    assert.equal(isBulkStep("research"), false);
    assert.equal(nextBulkStep("template"), "sender");
    assert.equal(nextBulkStep("sender"), "generate");
    assert.equal(nextBulkStep("results"), null);
  });
});
