import { WorkspacePage } from "@/components/admin/workspace-page";
export const dynamic = "force-dynamic";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WorkspacePage kind="system" searchParams={searchParams} />;
}
