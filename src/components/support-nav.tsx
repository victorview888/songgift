"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { title: "Help & pricing", links: [["/help", "Help"], ["/pricing", "Pricing"], ["/contact", "Contact"], ["/report", "Report content"]] },
  { title: "Policies", links: [["/policies/refunds", "Payment & refunds"], ["/policies/audio-storage", "Keeping your audio"], ["/policies/terms", "Terms"], ["/policies/privacy", "Privacy"], ["/policies/content-standards", "Content standards"]] },
];
export function SupportNav() {
  const path = usePathname();
  return <nav className="support-nav" aria-label="Help pages">{groups.map(group => <details key={group.title} open={group.links.some(([href]) => href === path)}><summary>{group.title}</summary><div>{group.links.map(([href, label]) => <Link key={href} href={href} aria-current={href === path ? "page" : undefined}>{label}</Link>)}</div></details>)}</nav>;
}
