// Rasterizes public/brand/sorts-mark.svg into the favicon, app icons and the desktop window/installer icon.
// Run after changing the mark: node scripts/brand-icons.mjs
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root);
const svg = await readFile(path("public/brand/sorts-mark.svg"));

async function png(size, padding = 0) {
  const inner = size - padding * 2;
  const mark = await sharp(svg, { density: 1024 }).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: padding, top: padding }])
    .png()
    .toBuffer();
}

/** ICO container with embedded PNG images (supported by every current browser and Windows). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const sizes = [16, 32, 48, 256];
const icoImages = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size, Math.round(size * 0.04)) })));
await writeFile(path("app/favicon.ico"), ico(icoImages));
await copyFile(path("public/brand/sorts-mark.svg"), path("app/icon.svg"));
await writeFile(path("app/apple-icon.png"), await sharp(await png(180, 22)).flatten({ background: "#0B1018" }).png().toBuffer());
await writeFile(path("public/brand/sorts-mark-512.png"), await png(512, 24));
await writeFile(path("desktop/assets/icon.png"), await png(512, 24));
await copyFile(path("public/brand/sorts-mark.svg"), path("desktop/assets/sorts-mark.svg"));
await writeFile(path("portal/app/icon.svg"), svg);
await mkdir(path("portal/public/brand"), { recursive: true });
await copyFile(path("public/brand/sorts-mark.svg"), path("portal/public/brand/sorts-mark.svg"));
await copyFile(path("public/brand/sorts-logo.svg"), path("portal/public/brand/sorts-logo.svg"));
console.log("Brand icons written.");
