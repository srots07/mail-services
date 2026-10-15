import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, sameOrigin } from "@/lib/auth";
import { HttpError, handle, json, readJson } from "@/lib/api";

const body = z.object({ deviceId: z.string().min(1) });

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Log in first.");
  const { deviceId } = body.parse(await readJson(request));
  const result = await db().device.updateMany({ where: { id: deviceId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) throw new HttpError(404, "That PC is not connected to your account.");
  return json({ ok: true });
});
