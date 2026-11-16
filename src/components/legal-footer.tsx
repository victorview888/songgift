"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { brandDescriptor, brandName } from "@/lib/brand";

const groups = [
  { title: "Make a song", links: [["Create a song", "/create"], ["Pricing", "/pricing"], ["Song occasions", "/occasions"], ["Song guides", "/guides"], ["My Songs", "/my-songs"]] },
  { title: "Here to help", links: [["Help", "/help"], ["Contact", "/contact"], ["Payments & refunds", "/policies/refunds"], ["Keeping your audio", "/policies/audio-storage"]] },
  { title: "Our policies", links: [["Terms of Service", "/policies/terms"], ["Privacy Policy", "/policies/privacy"], ["Content Standards", "/policies/content-standards"], ["Report content", "/report"]] },
];
const compactLinks = [groups[1].links[0], groups[1].links[1], groups[2].links[0], groups[2].links[1], groups[1].links[2], groups[1].links[3]];

export function LegalFooter() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  const compact = /^\/(create|login|lyrics|song|my-songs|account|gift|auth)(\/|$)/.test(pathname);

  return <footer className={`site-footer${compact ? " site-footer-compact" : ""}`}>
    {compact ? <nav className="footer-compact-links" aria-label="Legal and support">
      {compactLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
    </nav> : <div className="footer-main">
      <div className="footer-identity">
        <Link className="brand-link" href="/" aria-label="songforalways home"><Brand /></Link>
        <p className="footer-descriptor">{brandDescriptor}</p>
        <p>Keep the moments that matter<br />in a song made just for them.</p>
      </div>
      <nav className="footer-navigation" aria-label="Footer navigation">
        {groups.map(group => <div className="footer-group" key={group.title}>
          <h2>{group.title}</h2>
          <ul>{group.links.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
        </div>)}
      </nav>
    </div>}
    <div className="footer-bottom">
      <span>© 2026 {brandName}</span>
      {!pathname.startsWith("/gift/") && <button type="button" className="text-button" onClick={() => window.dispatchEvent(new Event("songgift:preferences"))}>Analytics preferences</button>}
    </div>
  </footer>;
}
