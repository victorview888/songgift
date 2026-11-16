// Package the generated songforalways mark for the site. See docs/brand-identity.md.
// Uses sharp, supplied by the existing Next.js dependency, only at development time.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../public/brand/', import.meta.url);
await mkdir(output, { recursive: true });
const source = await readFile(new URL('../design/brand/songforalways-mark.png', import.meta.url));
const iconPng = await sharp(source).resize(512,512).png().toBuffer();
const mark = `data:image/png;base64,${iconPng.toString('base64')}`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="${mark}" width="512" height="512"/></svg>`;
await writeFile(new URL('songforalways-icon.png', output), iconPng);
await sharp(source).resize(96,96).png().toFile(fileURLToPath(new URL('songforalways-mark.png', output)));
await sharp(source).resize(180,180).flatten({background:'#fffaf2'}).png().toFile(fileURLToPath(new URL('apple-touch-icon.png', output)));
// Keep previously published asset URLs working for crawlers and saved links.
await writeFile(new URL('songgift-icon.svg', output), icon);
await writeFile(new URL('songgift-icon.png', output), iconPng);
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="140" viewBox="0 0 680 140"><image href="${mark}" x="0" y="5" width="130" height="130"/><text x="140" y="89" fill="#29231f" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="700" letter-spacing="-3">songforalways</text></svg>`;
await writeFile(new URL('songforalways-logo.svg', output), wordmark);
await sharp(Buffer.from(wordmark)).png().toFile(fileURLToPath(new URL('songforalways-logo.png', output)));
const png = await sharp(source).resize(48,48).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header[6]=48; header[7]=48;
header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await writeFile(new URL('../src/app/favicon.ico', import.meta.url), Buffer.concat([header,png]));

const rings = [123,114,105,96,87,78].map(r=>`<circle cx="938" cy="288" r="${r}" fill="none" stroke="#f8f1e5" stroke-opacity=".14"/>`).join('');
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f8f1e5"/>
<circle cx="1110" cy="20" r="340" fill="#e9e2f1"/>
<circle cx="1140" cy="640" r="270" fill="#e4e8d8"/>
<image href="${mark}" x="50" y="42" width="64" height="64"/>
<g fill="#2d2925" font-family="DejaVu Sans, sans-serif"><text x="126" y="85" font-size="30" font-weight="700" letter-spacing="-1">songforalways</text>
<text x="60" y="178" font-size="17" fill="#97472f" letter-spacing="2">PERSONALIZED SONG GIFTS</text>
<text x="56" y="272" font-size="69" font-weight="700" letter-spacing="-3">Your story.</text>
<text x="56" y="358" font-size="69" font-weight="700" letter-spacing="-3">Their favorite</text>
<text x="56" y="444" font-size="69" font-weight="700" letter-spacing="-3">song.</text>
<text x="60" y="515" font-size="23" fill="#625b54">Real memories. A gift made with AI.</text>
<text x="60" y="570" font-size="18" fill="#625b54">songforalways.com</text></g>
<rect x="761" y="114" width="347" height="404" rx="22" fill="#ab533b"/>
<g fill="#fffaf2" font-family="DejaVu Sans, sans-serif"><text x="785" y="148" font-size="11" letter-spacing="1">FOR SOMEONE SPECIAL</text>
<text x="785" y="464" font-size="23" font-weight="700">Made from the</text><text x="785" y="493" font-size="23" font-weight="700">moments that matter.</text></g>
<circle cx="938" cy="288" r="136" fill="#2d2925"/>${rings}<circle cx="938" cy="288" r="47" fill="#e9e2f1"/><circle cx="938" cy="288" r="6" fill="#2d2925"/>
</svg>`;
await writeFile(new URL('songforalways-social.svg', output), social);
const socialPng = await sharp(Buffer.from(social)).png().toBuffer();
await writeFile(new URL('songforalways-social.png', output), socialPng);
await writeFile(new URL('songgift-social.svg', output), social);
await writeFile(new URL('songgift-social.png', output), socialPng);
console.log('Built songforalways logo, favicon, touch icon and 1200×630 social image.');
