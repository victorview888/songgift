import Link from "next/link";
import { AccountNav } from "./account-nav";
export function AccountHeader({ step }: { step?: string }) {
  return <header className="site-header form-header"><Link className="brand-link" href="/" aria-label="SongGift home"><span className="brand"><span className="brand-mark" aria-hidden="true">♪</span>songgift</span></Link><div className="header-actions">{step && <span className="form-progress">{step}</span>}<AccountNav /></div></header>;
}
