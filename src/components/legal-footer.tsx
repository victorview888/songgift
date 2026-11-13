"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LegalFooter() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return <footer className="legal-footer">
    <span>© 2026 SongGift</span>
    <nav aria-label="Legal and support">
      <Link href="/guides">Song guides</Link>
      <Link href="/occasions">Song occasions</Link>
      <Link href="/help">Help</Link>
      <Link href="/pricing">Pricing</Link>
      <Link href="/policies/content-standards">Content Standards</Link>
      <Link href="/report">Report content</Link>
      <Link href="/policies/terms">Terms of Service</Link>
      <Link href="/policies/privacy">Privacy Policy</Link>
      <Link href="/policies/refunds">Payments &amp; refunds</Link>
      <Link href="/policies/audio-storage">Keeping your audio</Link>
      <Link href="/contact">Contact</Link>
      {!pathname.startsWith("/gift/") && <button type="button" className="text-button" onClick={() => window.dispatchEvent(new Event("songgift:preferences"))}>Analytics preferences</button>}
    </nav>
  </footer>;
}
