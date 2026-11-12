import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/seo";

// Keep local and preview hosts usable. Only consolidate our two production hosts.
export function proxy(request: NextRequest) {
  const source = new URL(request.url);
  const canonical = new URL(siteUrl);
  const productionHost = source.hostname === canonical.hostname || source.hostname === "songforalways.com";

  if (productionHost && (source.protocol !== canonical.protocol || source.host !== canonical.host)) {
    // Assign the path instead of resolving it: a leading '//' must never replace the host.
    canonical.pathname = source.pathname;
    canonical.search = source.search;
    return NextResponse.redirect(canonical, {
      status: 308,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.next();
}
