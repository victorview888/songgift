import Link from "next/link";
import { AccountHeader } from "./account-header";

export function SupportShell({ children }: { children: React.ReactNode }) {
  return <main className="form-page"><AccountHeader /><section className="customer-shell support-shell"><nav className="customer-links" aria-label="Help pages"><Link href="/help">Help</Link><Link href="/contact">Contact</Link><Link href="/policies/refunds">Payment & refunds</Link><Link href="/policies/audio-storage">Keeping your audio</Link></nav>{children}</section></main>;
}
