"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { contentCategories, categoryLabels } from "@/lib/safety/categories";

export function ContentReportForm({ initialReference = "" }: { initialReference?: string }) {
  const [category, setCategory] = useState("other"), [reference, setReference] = useState(initialReference), [details, setDetails] = useState(""), [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState<{ id: string; body: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const body = JSON.stringify({ category, reference, details, email });
    const id = attempt?.body === body ? attempt.id : crypto.randomUUID();
    setAttempt({ id, body }); setBusy(true); setError("");
    try {
      const response = await fetch("/api/content-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), requestId: id, website: new FormData(event.currentTarget).get("website") || "" }) });
      const result = await response.json();
      if (!response.ok || !result.reference) throw new Error(result.error || "Your report could not be confirmed. Please retry.");
      setReceipt(result.reference);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your report could not be confirmed. Please retry."); }
    finally { setBusy(false); }
  }
  if (receipt) return <section className="customer-card" role="status"><h2>Report received</h2><p>Your report has been saved for review. Keep this reference: <strong className="report-reference">{receipt}</strong>.</p><p>We prioritise child safety and credible threats. We aim to start urgent reviews within 24 hours and other reviews within 3 business days, with a decision or progress update within 7 business days. If you provided an email, it can be used to ask for information or share an update.</p><button className="text-button" onClick={() => { setReceipt(""); setDetails(""); setAttempt(null); }}>Submit another report</button></section>;
  return <form className="contact-form customer-card" onSubmit={submit}><fieldset disabled={busy}>
    <label>Type of concern<select value={category} onChange={event => setCategory(event.target.value)}>{contentCategories.map(value => <option value={value} key={value}>{categoryLabels[value]}</option>)}</select></label>
    <label>Content link, order or report reference<input required maxLength={1000} value={reference} onChange={event => setReference(event.target.value)} placeholder="A SongGift page, order number or earlier report reference" /></label>
    <label>Describe the concern<textarea required minLength={20} maxLength={4000} rows={7} value={details} onChange={event => setDetails(event.target.value)} placeholder="Explain what needs review and why. Do not reproduce abusive material." /></label>
    <label>Your email (optional)<input type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <div className="report-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <p className="contact-note">You do not need an account. Do not upload, copy or forward child sexual abuse material or other illegal media. A link or reference and a short description are enough. For an immediate danger, contact local emergency services.</p>
    <p className="contact-note">Reports and contact details are stored privately for authorised review. See our <Link className="text-link" href="/policies/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.</p>
    <button className="primary-button" type="submit">{busy ? "Submitting…" : "Submit report"}</button>
  </fieldset>{error && <p className="form-error" role="alert">{error}</p>}</form>;
}
