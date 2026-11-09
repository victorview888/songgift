import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: { absolute: "管理后台 | SongGift" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Authorization belongs in each page's data access and each admin API, not only
// this persistent layout. It deliberately contains no privileged data.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root" lang="zh-CN">{children}</div>;
}
