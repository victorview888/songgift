# 后台模板模块迁移

来源：[qianshuixia/shrimpreel](https://github.com/qianshuixia/shrimpreel)，固定版本
`e1447714d61eb67af653c931e917dce7b63012b0`，MIT，Copyright (c) 2026 qianshuixia。
完整上游许可保存在 `third-party/shrimpreel/LICENSE`，改编文件也标注来源。

| 上游文件 | SongGift 适配位置 | 改编范围 |
| --- | --- | --- |
| `src/components/admin.tsx` | `src/components/admin/ui.tsx` | AdminPage、FilterSelect、Pager、LoadState、Status、shortDate；改为原生 GET 筛选、Next.js 链接和精确总页数，日期固定北京时间 |
| `src/routes/admin/route.tsx` | 同上 AdminShell | 导航结构，保留现有 SongGift 样式及已实现入口；每个页面仍独立服务端鉴权 |
| `src/routes/admin/orders.index.tsx` | `src/app/admin/orders/page.tsx` | 搜索筛选、列表、详情入口和分页的组合方式，保留已有 Supabase 查询和每页 20 条 |
| `src/routes/admin/orders.$id.tsx` | `src/app/admin/orders/[id]/page.tsx`、AdminTimeline | 详情分区、返回列表和按现有时间记录排序；替换成歌曲业务 |

本次复用的是改编后的组件及页面组合，不是整页原样移植。没有引入 TanStack、
D1、lucide 或模板支付依赖。SongGift 保留 Next.js 服务端页面与原生 GET 表单，
不需要复制 `useAdminData` 的客户端请求状态；Next.js 路由负责导航中断与结果切换。
`loading.tsx` 提供不含身份和订单数据的加载提示，`error.tsx` 提供通用重试入口。

没有迁入 `admin-orders.tsx` 的退款、补单、积分或金额格式化。缺失金额不显示为零；
付款、资产入库和原始汇总状态分别展示。时间线只依据现有数据库字段，缺失的
歌词确认、供应商完成和邮件发送事件不补造。

新增的音频访问与审计属于 SongGift 独立适配：通过管理员接口验证当前成员资格，
按订单和资产共同定位最终音频，签发 60 秒链接，数据库审计成功后才返回。
生产需在原管理员迁移之后执行 `20261105_admin_audio_audit.sql`；本次仅隔离测试，
不执行生产迁移、不授予真实账号权限。审计缺表不影响只读详情，但音频访问拒绝签发。

## 经营概览（第一版）

新增适配上游 `src/routes/admin/index.tsx` 的 Stat/Todo、统计卡片网格和双栏任务/待处理
布局，落在 `src/components/admin/overview.tsx`、`src/app/admin/page.tsx`。沿用已有
AdminPage/AdminCard/LoadState/AdminShell，新增手动刷新组件。独立 Supabase 统计服务
为 `src/lib/admin/overview.ts`，指标口径见 `docs/admin-overview.md`。没有移植上游积分、
视频成本、毛利、配置检测、用户数量及尚无对应功能的待处理链接。

## 生成任务查询页（第一版）

适配上游 `src/routes/admin/generations.tsx` 的筛选、分页、状态/异常列及刷新布局，
落在 `src/app/admin/jobs/page.tsx`，复用已迁移的后台共用组件。查询改为独立 Supabase
服务及 `GET /api/admin/jobs`，按来源区分订单最新引用和结构化任务记录。
没有引入模板视频、积分、成本/毛利或标记失败操作。完整范围见 `docs/admin-jobs.md`。


## 受控恢复、定时交付与通知（T03–T05）

订单操作区沿用已适配的详情卡片/动作反馈结构，新增 SongGift 独立的付款核实、原任务
同步和恢复保存；没有迁入模板手动标记付款、退款或退积分。

处理流程参考同一固定版本的 `src/server/jobs.ts`（定时维护、退避及异常兜底）和
`src/server/email.ts`（发件箱、发送租约、事件去重和重试）。适配位置为
`src/lib/services/maintenance.ts`、`src/lib/services/notifications.ts`、`workers/maintenance.ts`
及交付迁移；数据库、供应商和付款规则全部按 SongGift 实现。保留完整 MIT 许可及来源
标记，不引入 D1、R2、视频清理、积分或模板支付渠道。细节见 `docs/delivery-operations.md`。
