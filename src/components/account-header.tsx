import Link from "next/link";
import { AccountNav } from "./account-nav";
import { Brand } from "./brand";
export function AccountHeader({ step }: { step?: string }) {
  return <header className="site-header form-header"><Link className="brand-link" href="/" aria-label="songforalways home"><Brand /></Link><div className="header-actions">{step && <span className="form-progress">{step}</span>}<AccountNav /></div></header>;
}
