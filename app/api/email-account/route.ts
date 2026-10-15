import { authedRoute, ok } from "@/lib/api/handler";
import { providerForAccount, publicAccount } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import { getActiveEmailAccount, senderChangeBlocker } from "@/lib/services/providers";

export const GET = authedRoute({}, async ({ user }) => ok({ account: publicAccount(await getActiveEmailAccount(user.id)) }));

/** Disconnect: revokes the OAuth grant (best effort) and deletes stored tokens. */
export const DELETE = authedRoute({}, async ({ user }) => {
  const account = await getActiveEmailAccount(user.id);
  if (!account) throw new AppError("NOT_FOUND", "No email account is connected.");
  const blocked = await senderChangeBlocker(user.id, account.id);
  if (blocked) throw new AppError("INVALID_STATE", blocked);
  await providerForAccount(account).disconnect();
  await logActivity({ category: "AUTH", userId: user.id, message: `Email account disconnected: ${account.email} (${account.provider})` });
  return ok({ ok: true });
});
