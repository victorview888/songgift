// Server-side truncation. A browser playback timer is not an access boundary.
export const PREVIEW_SECONDS = 60;
type Clip = { bytes: Uint8Array; mime: "audio/mpeg" | "audio/wav"; seconds: number };

export function makePreviewClip(input: Uint8Array): Clip {
  const bytes = Buffer.from(input);
  if (bytes.length < 44 || bytes.length > 32 * 1024 * 1024) throw new Error("Invalid preview source size.");
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    let format: Buffer | undefined, audio: Buffer | undefined;
    for (let pos = 12; pos + 8 <= bytes.length;) {
      const size = bytes.readUInt32LE(pos + 4), end = pos + 8 + size;
      if (end > bytes.length) throw new Error("Truncated WAV source.");
      const tag = bytes.toString("ascii", pos, pos + 4);
      if (tag === "fmt ") format = bytes.subarray(pos + 8, end);
      if (tag === "data") audio = bytes.subarray(pos + 8, end);
      pos = end + size % 2;
    }
    if (!format || format.length < 16 || format.readUInt16LE(0) !== 1 || !audio) throw new Error("Only PCM WAV previews are supported.");
    const rate = format.readUInt32LE(4), byteRate = format.readUInt32LE(8), align = format.readUInt16LE(12), channels = format.readUInt16LE(2), bits = format.readUInt16LE(14);
    if (rate < 8000 || rate > 192000 || channels < 1 || channels > 8 || ![8, 16, 24, 32].includes(bits) || align !== channels * bits / 8 || byteRate !== rate * align) throw new Error("Invalid WAV rate.");
    const fullSeconds = Math.floor(audio.length / align) / rate;
    const excerptSeconds = Math.min(PREVIEW_SECONDS, fullSeconds > 10 ? fullSeconds - 5 : fullSeconds / 2);
    const size = Math.floor(excerptSeconds * byteRate / align) * align;
    if (!size) throw new Error("Empty WAV source.");
    const out = Buffer.alloc(44 + size);
    out.write("RIFF"); out.writeUInt32LE(out.length - 8, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
    format.copy(out, 20, 0, 16); out.write("data", 36); out.writeUInt32LE(size, 40); audio.copy(out, 44, 0, size);
    return { bytes: out, mime: "audio/wav", seconds: size / byteRate };
  }
  let pos = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3") {
    if ([6, 7, 8, 9].some(i => bytes[i] & 128)) throw new Error("Invalid ID3 size.");
    pos = 10 + (bytes[6] << 21 | bytes[7] << 14 | bytes[8] << 7 | bytes[9]) + (bytes[5] & 16 ? 10 : 0);
  }
  const frames: Buffer[] = [];
  let seconds = 0, streamRate = 0, streamVersion = -1, metadataOffset = 0, hasMetadataFrame = false;
  while (pos + 4 <= bytes.length) {
    if (bytes.toString("ascii", pos, pos + 3) === "TAG" && bytes.length - pos === 128) break;
    const h = bytes.readUInt32BE(pos), version = h >>> 19 & 3, layer = h >>> 17 & 3, rateId = h >>> 10 & 3, bitrateId = h >>> 12 & 15;
    if ((h >>> 21) !== 0x7ff || version === 1 || layer !== 1 || rateId === 3 || !bitrateId || bitrateId === 15) throw new Error("Unsupported or corrupt MP3 source.");
    const rate = [44100, 48000, 32000][rateId] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    if (streamRate && (streamRate !== rate || streamVersion !== version)) throw new Error("Inconsistent MP3 source.");
    streamRate = rate; streamVersion = version;
    const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateId] * 1000;
    const size = Math.floor((version === 3 ? 144 : 72) * bitrate / rate) + (h >>> 9 & 1);
    if (pos + size > bytes.length) throw new Error("Truncated MP3 frame.");
    const duration = (version === 3 ? 1152 : 576) / rate;
    const frame = Buffer.from(bytes.subarray(pos, pos + size));
    if (!frames.length) {
      const side = version === 3 ? ((h >>> 6 & 3) === 3 ? 17 : 32) : ((h >>> 6 & 3) === 3 ? 9 : 17);
      const xing = 4 + ((h >>> 16 & 1) ? 0 : 2) + side;
      metadataOffset = xing;
      const vbri = frame.toString("ascii", 36, 40) === "VBRI";
      hasMetadataFrame = ["Xing", "Info"].includes(frame.toString("ascii", xing, xing + 4)) || vbri;
      if (hasMetadataFrame) frame.fill(0, vbri ? Math.min(xing, 36) : xing);
    }
    frames.push(frame); seconds += duration; pos += size;
  }
  if (frames.length < 2 || !seconds) throw new Error("No playable MP3 frames.");
  const frameSeconds = (streamVersion === 3 ? 1152 : 576) / streamRate;
  const fullSeconds = (frames.length - (hasMetadataFrame ? 1 : 0)) * frameSeconds;
  // Keep a meaningful tail private even if a provider returns a short song.
  const targetSeconds = Math.min(59.9, fullSeconds > 10 ? fullSeconds - 5 : fullSeconds / 2);
  const audioFrames = Math.floor(targetSeconds / frameSeconds);
  if (audioFrames < 1) throw new Error("Recording is too short for an excerpt.");
  frames.length = Math.min(frames.length, audioFrames + (hasMetadataFrame ? 1 : 0));
  if (!hasMetadataFrame) {
    // Add a silent metadata frame rather than overwriting actual vocal data.
    const metadata = Buffer.alloc(frames[0].length);
    frames[0].copy(metadata, 0, 0, 4); metadata[1] |= 1; // no CRC in this new frame
    const mono = (metadata[3] >>> 6) === 3;
    metadataOffset = 4 + (streamVersion === 3 ? mono ? 17 : 32 : mono ? 9 : 17);
    frames.unshift(metadata);
  }
  const totalBytes = frames.reduce((size, frame) => size + frame.length, 0), first = frames[0];
  if (metadataOffset + 16 > first.length) throw new Error("MP3 metadata frame is too small.");
  first.write("Xing", metadataOffset); first.writeUInt32BE(3, metadataOffset + 4);
  first.writeUInt32BE(frames.length - 1, metadataOffset + 8); first.writeUInt32BE(totalBytes, metadataOffset + 12);
  return { bytes: Buffer.concat(frames), mime: "audio/mpeg", seconds: (frames.length - 1) * (streamVersion === 3 ? 1152 : 576) / streamRate };
}
