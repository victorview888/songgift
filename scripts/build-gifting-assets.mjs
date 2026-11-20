// Package original generated scenes as responsive static WebP images.
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const scenes = ["anniversary", "birthday", "wedding", "family", "pet", "memorial", "winter", "christmas-eve", "new-year", "home-hero"];
const output = new URL("../public/images/gifting/", import.meta.url);
await mkdir(output, { recursive: true });
const manifest = { createdOn: "2026-11-18", updatedOn: "2026-11-20", provenance: "Original OpenAI-generated illustrative scenes; not customer photographs", images: [] };
for (const scene of scenes) {
  const input = await readFile(new URL(`../design/gifting/${scene}.png`, import.meta.url));
  const meta = await sharp(input).metadata();
  const expectedRatio = scene === "home-hero" ? 16 / 9 : 1.5;
  if (Math.abs(meta.width / meta.height - expectedRatio) > 0.002) throw new Error(`${scene}: unexpected source aspect ratio`);
  const variants = [];
  for (const width of [480, 960, 1440]) {
    const filename = `${scene}-${width}.webp`;
    const { data, info } = await sharp(input).resize(width).webp({ quality: 78, effort: 5 }).toBuffer({ resolveWithObject: true });
    await writeFile(new URL(filename, output), data);
    variants.push({ path: `/images/gifting/${filename}`, width, height: info.height, bytes: data.length });
  }
  manifest.images.push({ scene, source: `design/gifting/${scene}.png`, sourceSha256: createHash("sha256").update(input).digest("hex"), variants });
}
await writeFile(new URL("../design/gifting/manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.images.length * 3} responsive WebP images in ${fileURLToPath(output)}`);
