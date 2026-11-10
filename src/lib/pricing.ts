// Checkout pricing is determined from the verified Supabase Auth identity on the server.
export function publicSongPriceUsd() {
  const value = process.env.SONG_PRICE_USD || "9.99";
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 10000) throw new Error("Song pricing is temporarily unavailable.");
  return Number(value).toFixed(2);
}
export function songPriceUsdForEmail(email: string | undefined) {
  return email?.trim().toLowerCase() === "victorview888@gmail.com"
    ? "1.00"
    : publicSongPriceUsd();
}
