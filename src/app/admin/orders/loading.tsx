import { LoadState } from "@/components/admin/ui";

// Access-neutral fallback: no identities, navigation shell or customer content.
export default function Loading() {
  return <main className="admin-access-message"><LoadState loading /></main>;
}
