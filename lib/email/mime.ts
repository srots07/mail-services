import { isValidEmail } from "@/lib/csv/validate";
import type { OutgoingEmail } from "./provider";

/** Removes CR/LF and other control characters to prevent header injection. */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n\u0000-\u001F\u007F]+/g, " ").trim();
}

function encodeWord(value: string): string {
  const clean = sanitizeHeader(value);
  return /^[\x20-\x7E]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function formatAddress(email: string, name?: string | null): string {
  const addr = sanitizeHeader(email);
  if (!name) return addr;
  const display = sanitizeHeader(name).replace(/["\\]/g, "");
  if (!display) return addr;
  const encoded = encodeWord(display);
  return encoded === display ? `"${display}" <${addr}>` : `${encoded} <${addr}>`;
}

function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();
}

/** Builds an RFC 5322 plain-text UTF-8 message. */
export function buildMimeMessage(msg: OutgoingEmail): string {
  if (!isValidEmail(msg.to)) throw new Error(`Invalid recipient address: ${msg.to}`);
  if (!isValidEmail(msg.from.email)) throw new Error("Invalid sender address");
  const cc = (msg.cc ?? []).filter((a) => a.toLowerCase() !== msg.to.toLowerCase());
  const badCc = cc.find((a) => !isValidEmail(a));
  if (badCc) throw new Error(`Invalid CC address: ${badCc}`);
  const body = msg.body.replace(/\r?\n/g, "\r\n");
  const headers = [
    `From: ${formatAddress(msg.from.email, msg.from.name)}`,
    `To: ${formatAddress(msg.to)}`,
    ...(cc.length ? [`Cc: ${cc.map((a) => formatAddress(a)).join(", ")}`] : []),
    `Subject: ${encodeWord(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrapBase64(Buffer.from(body, "utf8").toString("base64"))}\r\n`;
}
