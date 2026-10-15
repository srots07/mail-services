import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { providerForAccount } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { getActiveEmailAccount } from "@/lib/services/providers";
import { z } from "zod";

const testSendSchema = z.object({
  toEmail: z.string().email("A valid recipient email is required"),
});

export const POST = authedRoute({}, async ({ req, user }) => {
  const body = await readJson(req, testSendSchema);
  const account = await getActiveEmailAccount(user.id, "smtp");
  if (!account) {
    throw new AppError("NOT_FOUND", "No SMTP sending mail is configured. Save your settings first.");
  }

  const provider = providerForAccount(account);
  const result = await provider.sendTestEmail({
    from: {
      email: account.email,
      name: account.displayName || "Sorts Mail Engine",
    },
    to: body.toEmail.trim(),
    subject: "Test email from Sorts Direct SMTP",
    body: `Hello!\n\nThis is a test email sent from your newly configured SMTP sending mail (${account.email}) via Sorts Mail Engine.\n\nEverything is set up and working properly!\n\nSent at: ${new Date().toISOString()}`,
  });

  return ok({ ok: true, providerMessageId: result.providerMessageId });
});
