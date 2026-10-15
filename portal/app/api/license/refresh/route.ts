import { z } from "zod";
import { db } from "@/lib/db";
import { safeEqual, sha256 } from "@/lib/crypto";
import { issueLicense } from "@/lib/license";
import { clientIp, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({ deviceId: z.string().min(1).max(64), deviceSecret: z.string().min(20).max(200) });

/** Desktop app exchanges its device credentials for a fresh signed license (every few hours). */
export const POST = handle(async (request: Request) => {
  rateLimit(`license:${clientIp(request)}`, 60, 60_000);
  const { deviceId, deviceSecret } = body.parse(await readJson(request));
  const device = await db().device.findUnique({
    where: { id: deviceId },
    include: { user: { include: { subscription: true } } },
  });
  if (!device || !safeEqual(device.secretHash, sha256(deviceSecret))) {
    return json({ error: "This PC is not connected to an account.", code: "UNKNOWN_DEVICE" }, 401);
  }
  if (device.revokedAt) {
    return json({ error: "This PC was removed from the account. Connect it again.", code: "REVOKED" }, 401);
  }
  await db().device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return json({ license: issueLicense(device.user, device.user.subscription, device.id), email: device.user.email });
});
