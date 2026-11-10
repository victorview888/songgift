"use client";
// Form structure adapted from ShrimpReel (MIT), e1447714d61eb67af653c931e917dce7b63012b0,
// src/routes/{-$locale}/contact.tsx. License: third-party/shrimpreel/LICENSE.
import { useState, type FormEvent } from "react";

export function ContactForm({ email, initialOrderId }: { email: string | null; initialOrderId: string }) {
  const [topic, setTopic] = useState("Song or delivery"), [orderId, setOrderId] = useState(initialOrderId), [message, setMessage] = useState("");
  const [draft, setDraft] = useState<{ href: string; text: string } | null>(null);
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    const text = "Topic: " + topic + "\n" + (orderId.trim() ? "Order reference: " + orderId.trim() + "\n" : "") + "\n" + message.trim();
    setDraft({ href: "mailto:" + email + "?subject=" + encodeURIComponent("SongGift support · " + topic) + "&body=" + encodeURIComponent(text), text });
  }
  return <section className="customer-card">{email ? <p>Email <a className="text-link" href={"mailto:" + email}>{email}</a>, or prepare a message below.</p> : <p role="status">Email support is currently unavailable. For payment questions, keep your receipt from your payment provider and your SongGift order reference.</p>}
    <form className="contact-form" onSubmit={prepare} onChange={() => setDraft(null)}><fieldset disabled={!email}><label><span>What can we help with?</span><select value={topic} onChange={e => setTopic(e.target.value)}><option>Song or delivery</option><option>Payment or refund</option><option>Account access</option><option>Other question</option></select></label><label><span>Order reference (optional)</span><input value={orderId} maxLength={36} pattern="[0-9a-fA-F-]{36}" onChange={e => setOrderId(e.target.value)} placeholder="Full order reference from My Songs" /></label><label><span>Your message</span><textarea required minLength={10} maxLength={2000} rows={7} value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe what happened and what you need help with." /></label><p className="contact-note">Include the order reference and a description of the issue. Keep passwords, sign-in codes, card details and private stories out of your message.</p><button className="primary-button" type="submit">Prepare email</button></fieldset></form>
    {draft && <div className="contact-preview" role="status"><h2>Your email draft is ready</h2><pre>{draft.text}</pre><a className="primary-button" href={draft.href}>Open email app</a><p>Review and send the draft in your email app. This page has not sent a message. If no app opens, copy the text above and email {email}.</p></div>}
  </section>;
}
