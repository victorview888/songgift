import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { HttpError } from "./server";
import { requireAdmin, type AdminIdentity } from "./admin";

export type AdminPageAccess =
  | { status: 200; admin: AdminIdentity }
  | { status: 401 }
  | { status: 403 }
  | { status: 503 };

// Read-only SSR check. Cookie refresh is written by the existing account
// session API; Server Components cannot set response cookies while rendering.
// Each protected page must await this check before fetching privileged data.
export async function getAdminPageAccess(): Promise<AdminPageAccess> {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return { status: 503 };
    const jar = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: () => {},
      },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email_confirmed_at) return { status: 401 };
    return { status: 200, admin: await requireAdmin(data.user) };
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      return { status: error.status as 401 | 403 };
    }
    return { status: 503 };
  }
}
