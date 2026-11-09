// Shared with overview counts and the order-list review filter.
export const REVIEW_FILTER = "status.eq.failed,status.eq.completed,generation_error.not.is.null";

export function overviewWindow(now: Date) {
  const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+08:00`).toISOString();
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  return { day, start, end };
}
