// Original SongGift vector artwork. Run from the repository root with Node.
// Uses sharp, supplied by the existing Next.js dependency, only at development time.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../public/brand/', import.meta.url);
await mkdir(output, { recursive: true });
const note = '<path d="M148 55v91c0 18-16 31-34 31-14 0-24-8-24-19 0-16 16-29 34-29 3 0 6 0 9 1V70l48-13v34l-33 9" fill="#fffaf2"/>';
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="60" fill="#ab533b"/><circle cx="128" cy="128" r="99" fill="none" stroke="#fffaf2" stroke-opacity=".3" stroke-width="2"/>${note}</svg>`;
await writeFile(new URL('songgift-icon.svg', output), icon);
await sharp(Buffer.from(icon)).resize(512,512).png().toFile(fileURLToPath(new URL('songgift-icon.png', output)));
await sharp(Buffer.from(icon)).resize(180,180).png().toFile(fileURLToPath(new URL('apple-touch-icon.png', output)));
const png = await sharp(Buffer.from(icon)).resize(48,48).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header[6]=48; header[7]=48;
header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await writeFile(new URL('../src/app/favicon.ico', import.meta.url), Buffer.concat([header,png]));

const rings = [123,114,105,96,87,78].map(r=>`<circle cx="938" cy="288" r="${r}" fill="none" stroke="#f8f1e5" stroke-opacity=".14"/>`).join('');
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f8f1e5"/>
<circle cx="1110" cy="20" r="340" fill="#e9e2f1"/>
<circle cx="1140" cy="640" r="270" fill="#e4e8d8"/>
<rect x="54" y="52" width="46" height="46" rx="13" fill="#ab533b"/>
<path d="M83 61v21c0 5-4 9-9 9-4 0-7-2-7-6s4-8 9-8h2V65l12-3v7l-7 2" fill="#fffaf2"/>
<g fill="#2d2925" font-family="DejaVu Sans, sans-serif"><text x="114" y="85" font-size="30" font-weight="700" letter-spacing="-1">songgift</text>
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
await writeFile(new URL('songgift-social.svg', output), social);
await sharp(Buffer.from(social)).png().toFile(fileURLToPath(new URL('songgift-social.png', output)));
console.log('Built SongGift favicon, logo, touch icon and 1200×630 social image.');
