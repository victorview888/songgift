// Shared by the server and the sign-in UI. Never import server credentials here.
export function safeNext(value: unknown, fallback = "/my-songs") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  const url = new URL(value, "https://songgift.invalid");
  if (url.origin !== "https://songgift.invalid" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return fallback;
  return url.pathname + url.search + url.hash;
}
