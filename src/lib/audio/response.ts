export function audioResponse(bytes: Uint8Array, mime: string, range: string | null, publicSample = false) {
  const headers = new Headers({
    "Content-Type": mime, "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    "Cache-Control": publicSample ? "public, max-age=86400" : "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
  });
  let start = 0, end = bytes.length - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const invalid = () => { headers.set("Content-Range", `bytes */${bytes.length}`); return new Response(null, { status: 416, headers }); };
    if (!match || !match[1] && !match[2]) return invalid();
    if (!match[1]) {
      const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid();
      start = Math.max(0, bytes.length - suffix);
    } else {
      start = Number(match[1]); end = match[2] ? Number(match[2]) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= bytes.length || end < start) return invalid();
      end = Math.min(end, bytes.length - 1);
    }
    status = 206; headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(Buffer.from(bytes.subarray(start, end + 1)), { status, headers });
}
