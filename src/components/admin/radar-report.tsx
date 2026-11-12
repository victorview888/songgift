import { AdminCard, shortDate } from "./ui";
import type { RadarReport } from "@/lib/radar/report";

export const radarStatusLabels = { complete: "采集完成", partial: "部分来源失败", failed: "采集失败" };
const sourceLabels = { ok: "采集成功", baseline: "已建立基线", error: "采集失败", off: "未启用" };
const kindLabels = { repository: "开源项目", model: "模型 / 演示", page: "站点页面", term: "候选词" };

export function RadarReportView({ report }: { report: RadarReport }) {
  return <>
    <p className="admin-order-note">生成时间：{shortDate(report.generatedAt)}（北京时间） · {report.items.length} 条歌曲、音频与赠礼相关线索。仅使用公开免费数据，未购买搜索量、关键词难度或 AI 分析。</p>
    {report.sources.some(source => source.status === "baseline") && <p className="admin-operation-message">部分来源首次运行，仅建立快照基线；后续报告才会比较新增内容。候选线索不代表搜索需求已经验证。</p>}
    <section className="admin-radar-sources" aria-label="采集来源">{report.sources.map(source => <div className="admin-card" key={source.id}>
      <h2>{source.name}</h2><span className={`admin-order-badge admin-tone-${source.status === "error" ? "bad" : source.status === "off" ? "muted" : "ok"}`}>{sourceLabels[source.status]}</span>
      <p>读取 {source.count} 条 · 新增信号 {source.newCount} 条</p><p className="admin-order-note">{source.note}</p>
    </div>)}</section>
    <AdminCard title="值得核对的线索">{report.items.length ? <ol className="admin-radar-items">{report.items.map((item, index) => <li key={`${item.sourceId}-${index}`}>
      <small>{kindLabels[item.kind]} · {report.sources.find(source => source.id === item.sourceId)?.name}</small>
      <h3>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a> : item.title}</h3><p>{item.detail}</p>
    </li>)}</ol> : <p className="admin-order-note">本次没有筛出相关线索。可能正在建立基线、来源暂时失败，或公开榜单中没有匹配内容；这不表示市场没有需求。</p>}</AdminCard>
    <AdminCard title="如何用于 SongGift"><p className="admin-order-note">先查看来源，核对歌曲生成能力、赠礼场景及内容机会，再决定是否纳入产品或 SEO 选题。本页不会自动修改网站、生成歌曲或发送邮件。Search Console 尚未授权，当前不包含本站搜索查询数据。</p></AdminCard>
  </>;
}
