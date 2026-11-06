export type CustomerTransaction = {
  id: string; type: "capture" | "refund"; externalId: string; environment: "sandbox" | "live";
  amountMinor: number; currency: string; occurredAt: string;
};
export type CustomerPayment = {
  orderId: string; title: string | null; recipientName: string; createdAt: string; paidAt: string | null;
  quote: { amountMinor: number; currency: string; environment: "sandbox" | "live"; quotedAt: string } | null;
  transactions: CustomerTransaction[]; historyTruncated: boolean;
};
export type CustomerPaymentsPage = { orders: CustomerPayment[]; page: number; pageSize: number; total: number };
