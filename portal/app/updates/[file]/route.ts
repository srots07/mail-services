import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { updatesDir } from "@/lib/updates";

/**
 * Serves desktop releases for the in-app updater: `latest.json` plus the installers listed in it.
 * Files are published here by `npm run release` in the desktop project.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (file !== "latest.json" && !/^[\w .-]+\.exe$/.test(file)) return new Response("Not found", { status: 404 });

  const full = path.join(updatesDir(), path.basename(file));
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  const isManifest = file === "latest.json";
  const body = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": isManifest ? "application/json" : "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": isManifest ? "no-store" : "public, max-age=31536000, immutable",
      ...(isManifest ? {} : { "Content-Disposition": `attachment; filename="${path.basename(file)}"` }),
    },
  });
}
