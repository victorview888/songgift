import "server-only";
import type { User } from "@supabase/supabase-js";
import { authRoute, HttpError, type AuthContext } from "./server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AdminIdentity = { userId: string; email: string; role: "owner" };
export type AdminContext = AuthContext & { user: User; admin: AdminIdentity };

// Membership is read on every call. A stale JWT or client-supplied role must
// never keep an administrator authorized after membership is revoked.
export async function requireAdmin(user: User | null): Promise<AdminIdentity> {
  if (!user?.id || !user.email_confirmed_at) {
    throw new HttpError(401, "Please sign in to continue.");
  }

  let membership;
  try {
    membership = await getSupabaseAdmin()
      .from("admin_members")
      .select("user_id,role,active")
      .eq("user_id", user.id)
      .maybeSingle();
  } catch {
    throw new HttpError(503, "Administrator access is temporarily unavailable. Please try again later.");
  }
  if (membership.error) {
    // Missing migrations, revoked grants and outages all fail closed. Never
    // return the database error, session, or user metadata to the caller.
    throw new HttpError(503, "Administrator access is temporarily unavailable. Please try again later.");
  }
  const row = membership.data;
  if (!row || row.user_id !== user.id || row.active !== true || row.role !== "owner") {
    throw new HttpError(403, "You do not have access to the administration area.");
  }
  return { userId: user.id, email: user.email || "", role: "owner" };
}

// Every future admin API must enter through this wrapper before reading or
// changing business data. A check in the layout or browser is not sufficient.
export function adminRoute(
  request: Request,
  handler: (context: AdminContext) => Promise<Response>,
) {
  return authRoute(request, async (context) => {
    const admin = await requireAdmin(context.user);
    return handler({ ...context, user: context.user!, admin });
  });
}
