import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256, userCode } from "@/lib/crypto";
import { clientIp, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({ deviceName: z.string().trim().min(1).max(80).default("Windows PC") });
const EXPIRES_SECONDS = 15 * 60;

/** Desktop app asks for a code; the customer confirms it on /activate while logged in. */
export const POST = handle(async (request: Request) => {
  rateLimit(`device-start:${clientIp(request)}`, 10, 60_000);
  const { deviceName } = body.parse(await readJson(request));
  const deviceCode = randomToken(32);
  const code = userCode();
  await db().deviceCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
  await db().deviceCode.create({
    data: { userCode: code, deviceCodeHash: sha256(deviceCode), deviceName, expiresAt: new Date(Date.now() + EXPIRES_SECONDS * 1000) },
  });
  return json({
    deviceCode,
    userCode: code,
    verificationUrl: `${env().APP_URL}/activate?code=${encodeURIComponent(code)}`,
    interval: 3,
    expiresIn: EXPIRES_SECONDS,
  });
});
