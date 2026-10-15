// electron-builder afterPack hook: copies the Next.js standalone server into resources/server.
// Done here because extraResources drops nested node_modules folders.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const src = path.join(__dirname, "..", "desktop", "app-server");
  const dest = path.join(context.appOutDir, "resources", "server");
  if (!fs.existsSync(path.join(src, "server.js"))) throw new Error("desktop/app-server is missing; run npm run desktop:prepare first.");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, filter: (p) => !/^\.env/.test(path.basename(p)) });
};
