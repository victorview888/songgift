import "server-only";
import { HttpError } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const PAGE_SIZE = 20;
export const paymentLabels = { all: "全部", recorded: "已记录付款", unrecorded: "未记录付款" };
export const deliveryLabels = { all: "全部", delivered: "已有最终音频", undelivered: "无最终音频记录", generating: "生成中（未入库）", failed: "失败（未入库）" };
export const providers = ["fal", "musicapi", "mureka_cn", "google_lyria", "mock"] as const;
export type OrderFilters = {
  searchBy: "id" | "email" | "paypal";
  q: string; from: string; to: string;
  payment: keyof typeof paymentLabels;
  delivery: keyof typeof deliveryLabels;
  provider: string; page: number;
};

export function parseOrderFilters(params: URLSearchParams): OrderFilters {
  const read = (key: string, fallback = "") => {
    if (params.getAll(key).length > 1) throw new HttpError(400, "筛选参数不能重复。");
    return params.get(key)?.trim() || fallback;
  };
  const searchBy = read("searchBy", "id");
  const q = read("q");
  const payment = read("payment", "all");
  const delivery = read("delivery", "all");
  const provider = read("provider");
  const page = read("page", "1");
  if (!["id", "email", "paypal"].includes(searchBy) || !Object.hasOwn(paymentLabels, payment) || !Object.hasOwn(deliveryLabels, delivery) || (provider && !(providers as readonly string[]).includes(provider))) throw new HttpError(400, "请选择有效的筛选条件。");
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new HttpError(400, "页码须为 1 至 999999 的整数。");
  if (q.length > 254 || (q && searchBy === "id" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) || (q && searchBy === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) || (q && searchBy === "paypal" && !/^[a-z0-9]{1,64}$/i.test(q))) throw new HttpError(400, "请输入完整有效的订单号、邮箱或 PayPal 订单号。");
  const date = (key: string) => {
    const value = read(key);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new HttpError(400, "请输入有效日期（YYYY-MM-DD）。");
    return value;
  };
  const from = date("from"), to = date("to");
  if (from && to && from > to) throw new HttpError(400, "开始日期不能晚于结束日期。");
  return { searchBy, q, payment, delivery, provider, page: Number(page), from, to } as OrderFilters;
}

type OrderRow = {
  id: string; user_id: string | null; email: string | null; recipient_name: string;
  occasion: string; status: string; paid_at: string | null; created_at: string;
  paypal_order_id: string | null; music_provider: string | null; music_model: string | null;
  final_assets: { id: string }[];
};
export type AdminOrderSummary = Omit<OrderRow, "final_assets"> & { hasFinalAudio: boolean };
export type AdminOrderList = { orders: AdminOrderSummary[]; page: number; pageSize: number; total: number; totalPages: number };

// Call only AFTER the page/API has checked current admin membership. This
// privileged read never fetches stories, lyrics, storage paths or signed URLs.
export async function listAdminOrders(filters: OrderFilters): Promise<AdminOrderList> {
  const columns = "id,user_id,email,recipient_name,occasion,status,paid_at,created_at,paypal_order_id,music_provider,music_model";
  const relation = filters.delivery === "delivered" ? "final_assets:song_assets!inner(id)" : "final_assets:song_assets(id)";
  let query = getSupabaseAdmin().from("song_orders")
    .select(`${columns},${relation}`, { count: "exact" })
    .eq("final_assets.is_final", true);
  if (filters.q) {
    if (filters.searchBy === "email") {
      // ilike provides case-insensitive exact matching; escape pattern syntax.
      query = query.ilike("email", filters.q.replace(/[\\%_]/g, "\\$&"));
    } else query = query.eq(filters.searchBy === "id" ? "id" : "paypal_order_id", filters.q);
  }
  if (filters.from) query = query.gte("created_at", new Date(`${filters.from}T00:00:00+08:00`).toISOString());
  if (filters.to) query = query.lt("created_at", new Date(Date.parse(`${filters.to}T00:00:00+08:00`) + 86400000).toISOString());
  if (filters.payment === "recorded") query = query.not("paid_at", "is", null);
  if (filters.payment === "unrecorded") query = query.is("paid_at", null);
  if (["undelivered", "generating", "failed"].includes(filters.delivery)) query = query.is("final_assets", null);
  if (["generating", "failed"].includes(filters.delivery)) query = query.eq("status", filters.delivery);
  if (filters.provider) query = query.eq("music_provider", filters.provider);
  const start = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + PAGE_SIZE - 1);
  if (error || count === null) throw new HttpError(503, "订单查询暂时不可用，请稍后重试。");
  const orders = (data as unknown as OrderRow[]).map(({ final_assets, ...row }) => ({ ...row, hasFinalAudio: final_assets.length > 0 }));
  return { orders, page: filters.page, pageSize: PAGE_SIZE, total: count, totalPages: Math.ceil(count / PAGE_SIZE) };
}
