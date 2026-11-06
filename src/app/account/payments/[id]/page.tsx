"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePrivateResource } from "@/components/use-private-resource";
import { paymentDate, paymentMoney, paymentSummary } from "@/lib/account/payment-display";
import type { CustomerPayment } from "@/lib/types/payments";

export default function PaymentRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, retry } = usePrivateResource<{ record: CustomerPayment }>("/api/account/payments/" + id, "/account/payments/" + id);
  const record = data?.record, summary = record && paymentSummary(record);
  return <><p className="section-kicker">For your records</p><h1 className="customer-title">Order payment record</h1>
    {error ? <div className="form-error" role="alert">{error} <button className="text-button" onClick={retry}>Try again</button></div> : loading ? <p role="status">Finding this payment record…</p> : record && summary && <>
      <section className="customer-card receipt-summary"><h2>{record.title || "A song for " + record.recipientName}</h2><p>{summary.test && <strong className="payment-test">Sandbox test · </strong>}{summary.label}</p><dl className="receipt-fields"><dt>Order reference</dt><dd>{record.orderId}</dd><dt>Created</dt><dd>{paymentDate(record.createdAt)}</dd><dt>Verified payment amount</dt><dd>{summary.amount}</dd>{record.quote && <><dt>Original quote</dt><dd>{paymentMoney(record.quote.amountMinor, record.quote.currency)} · {record.quote.environment === "sandbox" ? "Sandbox test" : "Live"}</dd><dt>Quote saved</dt><dd>{paymentDate(record.quote.quotedAt)}</dd></>}</dl></section>
      <section className="customer-card"><h2>Recorded transactions</h2>{!record.transactions.length ? <p>No verified transaction is recorded for this order. If PayPal shows a payment, keep its receipt and contact support with this order reference.</p> : record.transactions.map(t => <article className="receipt-transaction" key={t.id}><h3>{t.type === "capture" ? "Payment captured" : "Refund recorded"} · {paymentMoney(t.amountMinor, t.currency)}</h3><dl className="receipt-fields"><dt>Provider</dt><dd>PayPal · {t.environment === "sandbox" ? "Sandbox test" : "Live"}</dd><dt>Transaction reference</dt><dd>{t.externalId}</dd><dt>Date</dt><dd>{paymentDate(t.occurredAt)}</dd></dl></article>)}{record.historyTruncated && <p role="status">Showing the latest 50 transactions. The full payment record needs review; contact support for earlier entries.</p>}</section>
      <div className="draft-actions receipt-actions"><button className="primary-button" onClick={() => window.print()}>Print payment record</button><Link className="text-link" href={"/song/" + record.orderId}>Open song</Link><Link className="text-link" href={"/contact?orderId=" + record.orderId}>Get help with this order</Link></div><p className="library-footnote">Keep this reference with the receipt in your PayPal Activity. A saved quote or checkout return alone does not confirm payment.</p>
    </>}
    <p className="receipt-actions"><Link className="text-link" href="/account/payments">← Payment history</Link></p>
  </>;
}
