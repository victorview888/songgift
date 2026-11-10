import "server-only";

export function waffoEnvironment() {
  const mode = process.env.WAFFO_ENVIRONMENT;
  return mode === "test" || mode === "prod" ? mode : null;
}
export function isWaffoConfigured() {
  return process.env.WAFFO_ENABLED === "true" && !!waffoEnvironment() &&
    /^MER_[A-Za-z0-9]+$/.test(process.env.WAFFO_MERCHANT_ID || "") &&
    /^STO_[A-Za-z0-9]+$/.test(process.env.WAFFO_STORE_ID || "") &&
    /^PROD_[A-Za-z0-9]+$/.test(process.env.WAFFO_PRODUCT_ID || "") && !!process.env.WAFFO_PRIVATE_KEY?.trim();
}
export function paymentMethods() {
  const live = (process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase() === "live";
  const paypal = live ? !!(process.env.PAYPAL_LIVE_CLIENT_ID && process.env.PAYPAL_LIVE_CLIENT_SECRET) : !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  return [
    { id: "paypal" as const, label: "PayPal", description: "Pay with your PayPal account.", available: paypal },
    { id: "waffo" as const, label: "Waffo", description: "Choose from the payment options available at secure checkout.", available: isWaffoConfigured() },
  ];
}
