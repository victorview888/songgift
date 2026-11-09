import type { CustomerPayment } from "@/lib/types/payments";

export function paymentMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (!Number.isSafeInteger(amount) || amount! < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return "Amount unverified";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount! / 100);
}
export function paymentDate(at: string) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
export function paymentSummary(record: CustomerPayment) {
  const captures = record.transactions.filter(t => t.type === "capture"), capture = captures[0];
  const refunds = record.transactions.filter(t => t.type === "refund");
  const test = record.transactions.length ? record.transactions.every(t => t.environment === "sandbox") : record.quote?.environment === "sandbox";
  if (record.historyTruncated || captures.length > 1 || (!capture && refunds.length) || refunds.some(t => t.currency !== capture?.currency || t.environment !== capture?.environment)) return { label: "Payment record needs review", amount: "Amount unverified", test };
  if (!capture) return { label: record.paidAt ? "Historical payment · amount unverified" : "No verified payment recorded", amount: record.paidAt ? "Amount unverified" : "Not recorded", test: record.quote?.environment === "sandbox" };
  const refunded = refunds.reduce((total, t) => total + t.amountMinor, 0);
  if (refunded > capture.amountMinor) return { label: "Payment record needs review", amount: "Amount unverified", test: capture.environment === "sandbox" };
  return { label: refunded === capture.amountMinor ? "Refund recorded" : refunded ? "Partial refund recorded" : "Payment verified", amount: paymentMoney(capture.amountMinor, capture.currency), test: capture.environment === "sandbox" };
}
