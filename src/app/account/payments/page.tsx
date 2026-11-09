"use client";
// Billing cards/pagination adapted from ShrimpReel (MIT), e1447714d61eb67af653c931e917dce7b63012b0,
// src/routes/{-$locale}/dashboard/billing.tsx. License: third-party/shrimpreel/LICENSE.
import Link from "next/link";
import { useState } from "react";
import { usePrivateResource } from "@/components/use-private-resource";
import { paymentDate, paymentMoney, paymentSummary } from "@/lib/account/payment-display";
import type { CustomerPaymentsPage } from "@/lib/types/payments";

export default function PaymentsPage() {
  const [page, setPage] = useState(0);
  const { data, loading, error, retry } = usePrivateResource<CustomerPaymentsPage>("/api/account/payments?page=" + page, "/account/payments");
  return <><p className="section-kicker">Your orders</p><h1 className="customer-title">Payment history</h1><p className="customer-intro">Payments recorded for your songs. Each order keeps its original quote; the paid amount comes from its verified transaction.</p>
    {error ? <div className="form-error" role="alert">{error} <button className="text-button" onClick={retry}>Try again</button></div> : loading ? <p role="status">Finding your payment records…</p> : data && <>
      {!data.orders.length ? <section className="customer-card"><h2>{page ? "No records on this page" : "No payment records yet"}</h2><p>{page ? "Return to an earlier page to find your orders." : "Orders appear here after a checkout quote or payment is saved. Your unfinished songs are in My Songs."}</p><Link className="text-link" href="/my-songs">Go to My Songs</Link></section> : <div className="payment-list">{data.orders.map(record => { const summary = paymentSummary(record); return <article className="customer-card payment-card" key={record.orderId}><div><p className="card-date">{paymentDate(record.createdAt)}</p><h2>{record.title || "A song for " + record.recipientName}</h2><p>{summary.test && <strong className="payment-test">Sandbox test · </strong>}{summary.label}</p><p className="payment-reference">Order {record.orderId}</p></div><div className="payment-card-value"><strong>{summary.amount}</strong>{record.quote && <small>Original quote: {paymentMoney(record.quote.amountMinor, record.quote.currency)}</small>}<Link className="text-link" href={"/account/payments/" + record.orderId}>View payment record</Link></div></article>; })}</div>}
      <div className="library-pagination"><button className="text-button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>← Previous</button><span>Page {page + 1}{data.total ? " of " + Math.ceil(data.total / data.pageSize) : ""}</span><button className="text-button" disabled={(page + 1) * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next →</button></div>
    </>}
    <p className="library-footnote">Historical amounts without a verified transaction stay unverified. Sandbox entries are test payments. <Link href="/help#payments">Payment help</Link></p>
  </>;
}
