// Package original generated scenes as responsive static WebP images.
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const scenes = ["anniversary", "birthday", "wedding", "family", "pet", "memorial", "winter", "christmas-eve", "new-year", "home-hero", "home-hero-bright"];
const output = new URL("../public/images/gifting/", import.meta.url);
await mkdir(output, { recursive: true });
const manifest = { createdOn: "2026-11-18", updatedOn: "2026-11-23", provenance: "Original OpenAI-generated illustrative scenes; not customer photographs", images: [] };
for (const scene of scenes) {
  const input = await readFile(new URL(`../design/gifting/${scene}.png`, import.meta.url));
  const meta = await sharp(input).metadata();
  const expectedRatio = scene.startsWith("home-hero") ? 16 / 9 : 1.5;
  if (Math.abs(meta.width / meta.height - expectedRatio) > 0.002) throw new Error(`${scene}: unexpected source aspect ratio`);
  const variants = [];
  const widths = scene === "home-hero-bright" ? [...new Set([480, 960, 1440, meta.width])] : [480, 960, 1440];
  for (const width of widths) {
    const filename = `${scene}-${width}.webp`;
    const { data, info } = await sharp(input).resize(width).webp({ quality: scene === "home-hero-bright" ? 84 : 78, effort: 5 }).toBuffer({ resolveWithObject: true });
    await writeFile(new URL(filename, output), data);
    variants.push({ path: `/images/gifting/${filename}`, width, height: info.height, bytes: data.length });
  }
  manifest.images.push({ scene, source: `design/gifting/${scene}.png`, sourceSha256: createHash("sha256").update(input).digest("hex"), variants });
}
await writeFile(new URL("../design/gifting/manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.images.reduce((total, image) => total + image.variants.length, 0)} responsive WebP images in ${fileURLToPath(output)}`);
