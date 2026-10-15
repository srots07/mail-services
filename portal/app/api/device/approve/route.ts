import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser, sameOrigin } from "@/lib/auth";
import { normaliseUserCode } from "@/lib/crypto";
import { HttpError, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({ userCode: z.string().min(1, "Enter the code shown in the app.") });

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Log in first.");
  rateLimit(`device-approve:${user.id}`, 15, 60_000);
  const code = normaliseUserCode(body.parse(await readJson(request)).userCode);
  const row = await db().deviceCode.findUnique({ where: { userCode: code } });
  if (!row || row.expiresAt < new Date() || row.deviceId) {
    throw new HttpError(404, "That code is wrong or has expired. Click Connect account in the app again to get a new one.");
  }
  if (row.approvedByUserId && row.approvedByUserId !== user.id) throw new HttpError(409, "That code was already used by another account.");
  const active = await db().device.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= env().MAX_DEVICES) {
    throw new HttpError(409, `You already have ${active} PCs connected (the limit is ${env().MAX_DEVICES}). Remove one on your account page first.`, "DEVICE_LIMIT");
  }
  await db().deviceCode.update({ where: { id: row.id }, data: { approvedByUserId: user.id, approvedAt: new Date() } });
  return json({ ok: true, deviceName: row.deviceName });
});
