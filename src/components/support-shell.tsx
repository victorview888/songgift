import { SupportNav } from "./support-nav";
import { AccountHeader } from "./account-header";

export function SupportShell({ children }: { children: React.ReactNode }) {
  return <main className="form-page"><AccountHeader /><section className="customer-shell support-shell"><SupportNav />{children}</section></main>;
}
