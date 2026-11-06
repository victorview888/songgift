"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AccountLinks() {
  const path = usePathname();
  return <nav className="customer-links" aria-label="Account pages">{[["/my-songs", "My Songs"], ["/account/payments", "Payment history"], ["/account", "Account"], ["/help", "Help"]].map(([href, label]) => <Link key={href} href={href} aria-current={path === href || (href === "/account/payments" && path.startsWith(href + "/")) ? "page" : undefined}>{label}</Link>)}</nav>;
}
