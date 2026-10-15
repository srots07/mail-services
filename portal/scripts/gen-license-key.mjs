// Generates the Ed25519 key pair for desktop licenses.
// Put LICENSE_SIGNING_KEY in the website's settings (secret) and LICENSE_PUBLIC_KEY in the desktop build.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("# Website (portal/.env or Vercel settings) - keep secret:");
console.log(`LICENSE_SIGNING_KEY="${priv}"`);
console.log("");
console.log("# Desktop build (root .env, read by npm run desktop:prepare) - safe to ship:");
console.log(`LICENSE_PUBLIC_KEY="${pub}"`);
