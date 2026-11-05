// Checkout pricing is determined from the verified Supabase Auth identity on the server.
export function songPriceUsdForEmail(email: string | undefined) {
  return email?.trim().toLowerCase() === "victorview888@gmail.com"
    ? "1.00"
    : process.env.SONG_PRICE_USD || "9.99";
}
