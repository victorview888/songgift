// Detail pages may return only to the list, preserving filters and pagination.
export function adminOrdersBackLink(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) return "/admin/orders";
  try {
    const url = new URL(value, "https://songgift.invalid");
    if (!value.startsWith("/") || url.origin !== "https://songgift.invalid" || url.pathname !== "/admin/orders" || url.hash) return "/admin/orders";
    return url.pathname + url.search;
  } catch { return "/admin/orders"; }
}
