"use client";
import Link from "next/link";
import { useState } from "react";
export function HomeMenu() {
  const [open, setOpen] = useState(false);
  return <div className="mobile-menu"><button type="button" className="text-button" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>Menu</button>{open && <nav id="mobile-navigation" aria-label="Mobile navigation" onClick={() => setOpen(false)}><a href="#how-it-works">How it works</a><a href="#occasions">Occasions</a><Link href="/pricing">Pricing</Link><Link href="/help">Help</Link></nav>}</div>;
}
