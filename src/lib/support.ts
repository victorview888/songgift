import "server-only";

export function getSupportEmail() {
  const email = (process.env.SONGGIFT_SUPPORT_EMAIL || "").trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) ? email : null;
}
