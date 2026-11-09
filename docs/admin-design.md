<!-- 历史方案：最初参考 8964c18，实施分支已同步到 24034fc。当前功能进度、授权与测试状态请参阅 handoff-2026-11-05.md。 -->

# SongGift 管理后台设计方案

方案日期：2026-11-05。状态：设计稿，尚未实施。依据：本地 D:/codex/songgift 的 master（8964c18）中的现有代码与数据库迁移；未读取或记录密钥。

## 1. 产品定位与范围

后台服务于独立开发者日常经营：找订单、查支付、跟进生成、恢复交付、了解成本、定位异常。入口为 https://www.songforalways.com/admin，沿用现有项目、Supabase 登录、Postgres、私有 Storage、模型适配器和 Cloudflare 部署。

后台以中文为主，保留订单和模型的英文原始名称。数据库时间使用 UTC，界面默认北京时间并显示时区；日统计按明确选定的统计时区计算。第一版只支持现有 USD 业务，多币种以后按币种分别汇总。

第一批交付：管理员权限、经营概览、订单及详情、任务及恢复、用户基础资料、服务状态、操作审计。
第二批交付：无人值守任务同步、支付事件及对账、退款操作。
第三批按经营数据决定：成本报表、可编辑运营开关、CSV 导出、通知和内容管理。

## 2. 已有基础与必须补齐的数据

现有 song_orders 包含归属用户、故事、歌词、支付订单号、paid_at、音乐供应商/模型、任务引用和错误摘要；song_assets 包含私有音频对象路径及供应商引用。Supabase Auth 负责身份。authRoute 已提供已验证用户、同源 JSON 写请求检查、HttpOnly 会话和禁止缓存。

当前缺口：

- 没有独立管理员身份和后台接口。
- 单个 song_orders.status 混合了支付与交付状态；界面需要将两者分开显示。
- 支付记录缺少下单金额快照、实际捕获流水号、退款流水和手续费；不能用已付款订单数乘当前价格当真实营收。
- 生成只有订单上的最新引用，缺少每次尝试、阶段、查询时间、恢复记录与耗时。
- 结果查询及持久化主要由用户访问状态接口推动。
- 音频保存使用先查询后插入，增加后台及定时同步后需要数据库唯一约束和任务租约，避免并发重复存储。
- 当前 health 的 hasEmailCredentials 检查 Worker 的通知邮件配置，不能代表已生效的 Supabase Auth SMTP。后台要分开展示登录邮件和歌曲通知。

## 3. 页面与信息设计

| 页面 | 路径 | 第一版主要内容 |
| --- | --- | --- |
| 经营概览 | /admin | 新订单、已验证付款数、已交付数、进行中、异常待处理；实收金额仅在流水完整时显示 |
| 订单列表 | /admin/orders | 订单号/邮箱/PayPal 号精确搜索，日期、支付环境、支付状态、交付状态、供应商筛选，服务端分页 |
| 订单详情 | /admin/orders/[id] | 订单与用户、故事和已确认歌词、支付流水、任务历史、音频、事件时间线和内部备注 |
| 生成任务 | /admin/jobs | 供应商、模型、阶段、等待时长、最近查询、错误类别、重试及待人工确认 |
| 用户 | /admin/users | 分页读取 Auth 用户的必要字段，订单数及消费记录；用户详情链接到其订单 |
| 系统状态 | /admin/system | 运行环境、版本、模型配置、数据库、Storage、邮件链路、最近后台同步时间 |
| 审计日志 | /admin/audit | 管理员、动作、对象、原因、时间、结果；无编辑和清空按钮 |

推荐订单列表列：创建时间、订单号、用户、收礼人/场景、下单金额、支付状态、交付状态、模型、操作。移动端转换为摘要卡片。

订单详情采用信息卡与时间线：

1. 顶部：订单号、支付状态、交付状态、异常提示。
2. 左侧：用户与定制内容、歌词、音频播放器。
3. 右侧：支付凭据、供应商任务与恢复操作。
4. 下方：创建、歌词确认、付款、提交生成、供应商完成、上传完成、人工处理的时间线。

内部备注与客户可见字段分离，默认不发送邮件。列表不展开完整故事和歌词，进入详情时再读取。

## 4. 管理员身份与访问控制

第一版只开通一个 Owner，即你的已验证账号；预留只读角色，不做角色编辑界面。

- 管理员沿用现有邮箱登录，在 /admin 未登录时转到 /login?next=/admin。
- 每个后台页面的数据读取及 /api/admin/* 请求都必须在服务端通过 requireAdmin 检查。
- 检查顺序：现有 authRoute 验证真实用户 -> 用封装的服务端成员查询按 user.id 读取 admin_members -> 核对 active 和所需能力 -> 才允许执行业务数据的特权读取与操作。成员查询本身不返回额外业务数据。
- 第一位 Owner 通过一次受控数据库迁移按已验证用户 UUID 加入；不提供公开注册管理员或前端自助提权入口。
- 不使用用户可修改的 user_metadata.is_admin、localStorage、前端按钮隐藏或请求体 userId 作为管理员证明。
- admin_members 不向普通客户端开放写入；建议所有后台管理数据仅通过服务端 API 读取和操作。
- 用户侧现有订单 RLS 保持按 user_id 隔离；后台特权操作集中在通过权限检查后的服务层。Service Role 只在服务端使用，不能因可绕过 RLS 而省略接口鉴权。
- 后台接口 private/no-store；公开健康接口只返回最少健康状态，配置和内部错误转入受保护诊断页。
- 管理员播放和下载也使用独立受保护接口、短时签名链接，并记录访问；签名链接不进入审计日志。
- 资金操作上线前增加管理员二次验证，普通只读角色不能退款、重新生成、修改权限或配置。
- /admin 使用 noindex；robots 排除只用于搜索控制，访问控制仍由服务端负责。

## 5. 数据模型

建议第一批新增以下五张表，保留已有订单和音频：

| 表 | 核心字段与用途 |
| --- | --- |
| admin_members | user_id、role、active、created_at：管理员成员资格 |
| generation_jobs | id、order_id、attempt_no、environment、provider、model、provider_job_id、state、poll_count、next_check_at、lease_token、lease_expires_at、error_code、error_summary、started_at、completed_at：每一次生成尝试及其恢复状态 |
| payment_transactions | id、order_id、provider、environment、transaction_type、external_id、amount_minor、currency、status、fee_minor、occurred_at：已核实的收款与退款事实 |
| order_events | id、order_id、event_type、actor_type、actor_id、safe_metadata、created_at：订单业务时间线及内部备注 |
| admin_audit_logs | id、actor_user_id、action、target_type、target_id、reason、request_id、safe_before、safe_after、result、created_at：管理员操作审计 |

song_orders 增加下单快照：quoted_amount_minor、currency、price_version、payment_environment；后续增加 active_generation_job_id、final_asset_id 等引用。新订单先保存报价再创建 PayPal 订单，捕获时与该订单的报价比较，不再与可能已变化的当前全站价格比较。

补齐原则：

- 金额以最小货币单位整数保存，例如 USD 9.99 保存为 999；前端仅负责格式化。
- 支付流水唯一约束覆盖 provider + environment + transaction_type + external_id。
- 供应商任务唯一约束考虑 provider + environment + provider_job_id；没有任务号的未知提交不能伪造任务号。
- 同订单同一时刻只允许一个活动生成尝试；所有入口共享原子预留和租约规则。
- 同一任务的 final 音频唯一；新对象路径确定化，重复完成事件复用已有对象。旧文件不搬迁。
- 日志只保存脱敏摘要，不写密钥、会话、签名音频 URL 或完整供应商原始响应。
- 历史付款可通过支付商核实后补流水；查不出的金额和成本显示“未核实”，不按当前价回填。
- 新迁移先添加可空字段与索引，回填后再增加能满足现有数据的约束；发现重复先输出核对清单，不自动删除历史资源。
- song_orders.status 暂时作为用户页面兼容的汇总状态，只由统一业务服务更新；支付事实与任务阶段分别由流水和任务记录解释。

任务状态建议：created -> submitting -> queued -> processing -> storing -> completed；另设 failed、needs_review。供应商完成但 Storage 失败属于 storing 阶段错误，不能当作需要重新生成。

第二批新增 payment_events，保存已验签支付事件的唯一 ID、接收时间、处理状态及脱敏摘要，支持重复和乱序事件的幂等处理。

## 6. 异常处理与按钮语义

| 按钮 | 实际行为 | 是否创建新付费生成 |
| --- | --- | --- |
| 同步任务状态 | 用原任务号查供应商，并更新本地记录 | 否；查询是否计费以供应商为准 |
| 恢复音频保存 | 从原任务重新取得结果，续做下载/上传/资产登记 | 否 |
| 核对付款 | 读取 PayPal 的实际捕获结果，匹配订单、环境、币种与金额后补本地流水 | 否；不调用 capture 代替查单 |
| 重新生成一首 | 新建明确关联的生成尝试，保留旧结果；需说明原因并确认预计费用 | 是 |
| 退款 | 后续通过真实 Capture ID 调用退款，按退款凭据记录结果 | 涉及真实资金，第二批实施 |

关键约束：

- 提交超时或供应商任务号未写回时，状态为“结果待确认”；不把网络超时等同于供应商未扣费，不自动重提生成。
- 无供应商任务号且无法可靠对账时进入人工处理，不允许管理员用通用“重试”按钮绕过。
- 有原任务号优先查询和恢复；只有供应商已确认失败且经营者决定承担新费用时才重新生成。
- “已完成”只在音频对象和资产记录都存在后设置；订单状态不能随意编辑为已付款或已交付。
- “核对付款”必须使用支付商权威结果；第一版没有手动标记已付款入口。
- 退款失败不在本地先显示已退款；退款后的历史音频默认不自动删除。
- 重复点击、页面刷新、并发操作、Webhook 重放都复用稳定操作 ID 与数据库约束。

## 7. 业务服务与 API 分层

建议文件：

- src/lib/auth/admin.ts：管理员鉴权和能力检查。
- src/lib/admin/orders.ts：后台查询、筛选及分页。
- src/lib/admin/audit.ts：脱敏审计；有副作用的动作应先登记持久化操作请求，审计不可用时不继续执行。
- src/lib/services/reconcile-song.ts：共享任务查询、音频保存与状态恢复逻辑。
- src/lib/services/reconcile-payment.ts：纯查单对账，与真实 capture/退款命令分开。
- src/app/admin/*：后台布局与页面。
- src/app/api/admin/*：后台接口，不复用只能访问当前用户自己订单的 API。

核心 API：GET /api/admin/overview、GET /api/admin/orders、GET /api/admin/orders/[id]、GET /api/admin/jobs、GET /api/admin/users、GET /api/admin/system、GET /api/admin/audit；POST /api/admin/orders/[id]/reconcile-payment、POST /api/admin/jobs/[id]/sync、POST /api/admin/jobs/[id]/resume-storage、POST /api/admin/orders/[id]/notes。

重新生成和退款分别使用专用 POST 命令，不能通过通用 PATCH status 实现。所有改变业务状态的操作都走 POST 和同源检查，GET 不应触发付费生成或退款。

音乐服务按每个任务保存的 provider/model 路由；后台改变默认模型只影响新任务，不能让旧任务跟随当前全局模型。现有 fal 任务前缀可继续兼容，但不作为所有供应商长期路由规则。

## 8. 后台同步和低成本部署

第一批先提供人工同步与恢复按钮，提取共享服务，确保后续自动调度不复制一套逻辑。

第二批建议从 Cloudflare Cron 每 2 分钟扫描到期任务开始，每次少量任务、最多两个并发，失败退避并记录 next_check_at。Cron 只推动已有任务的查询和结果保存，不自动发起新的收费生成。

Cron 必须有真正的 scheduled handler。不能只在现有 Next.js 路由旁添加 cron 表达式；实施时核实 vinext 的入口支持，若不支持则使用同仓库单独构建的轻量 Worker。后台任务不依赖客户浏览器会话，使用专门的服务端身份和受限调用边界。定时调度器没有公开的无鉴权触发接口。

业务服务只保留短暂任务租约，外部网络请求不占用长数据库事务。租约恢复及最终写回使用 token 检查；供应商提交的未知结果进入人工确认，而不是租约过期后直接再次提交。

需要自动提交、较多并发或更细粒度调度时再接 Cloudflare Queues；消息只携带任务 ID，任务状态以 Postgres 为准。Worker 收到前端请求后使用 waitUntil 不能替代持久化任务和调度。

数据库和音频继续使用现有 Supabase。后台本身不要求另购后台模板或新增数据库；实际请求、数据库、文件和模型用量按账户配额分别核算。

## 9. 统计口径和系统诊断

- 新订单：时间区间内创建的订单，可区分草稿与正式下单。
- 付款数/实收：验证成功的捕获流水，按付款时间，排除 Sandbox。
- 退款：成功退款流水，按退款发生时间，关联原订单。
- 交付率：所选付款 cohort 中已有持久化最终音频的订单比例；给出观察窗口。
- 任务成功率：按生成尝试统计，与订单交付率分开。
- 生成耗时：提交到供应商完成、完成到入库分别统计。
- 成本：每次歌词/音乐尝试记录成本估算，能取得账单时再核实；重做和失败有可能计费，不能只算已完成歌曲。
- 毛利估算：实收 - 退款 - 支付手续费 - 生成成本。缺少数据时标记未统计，不显示伪精确利润。
- 访问到付款漏斗需要埋点；第一批没有访问数据时只呈现数据库能证实的业务指标。

系统诊断分开显示：登录邮件（Supabase Auth -> Resend SMTP，已配置）与歌曲通知（独立应用发信链路，后续需求）。配置存在不等于真实可调用；状态分别是已配置、最近验证时间、最近错误。常规刷新不通过生成歌曲或发邮件来探活。

## 10. 实施批次与验收

### 第一批：先能经营和处理异常

1. 新建 codex/admin-console 分支，添加兼容迁移和 Owner 初始化流程。
2. 完成服务端权限、后台布局、订单查询、详情和受控音频访问。
3. 增加付款快照、事务记录、任务历史、事件和操作审计。
4. 提取同步与音频恢复服务，上线三个明确按钮：核对付款、同步任务、恢复保存。
5. 完成概览、用户基础列表和服务状态页。

验收：普通用户和未登录者不能访问后台数据；管理员可检索并查看真实已有订单；点击同步和恢复不会发起新的音乐生成；所有人工处理可追溯。新订单付款按下单快照校验。未知历史金额不伪造。

### 第二批：减少人工盯单

接 Cron 自动补齐结果、PayPal 验签 Webhook 和幂等事件处理、退款及二次验证；补齐支付和模型失败的对账流程。

验收：关闭客户页面后已有任务仍能完成入库；重复调度不重复存储或付费生成；Webhook 重放/乱序不重复记账；退款失败不会被记成成功；供应商提交超时不盲目再下单。

### 第三批：经营优化

模型成本、费用核实、统计漏斗、可审计导出、限流和每日生成上限、可版本化运营配置；按实际需求增加客服只读角色和内容管理。

## 11. 测试和发布

- 延续现有 fal 与 PayPal 回归测试；新增有实质风险的后台鉴权、跨用户访问、金额快照、状态恢复和并发幂等测试。
- 使用隔离的测试身份和标记清楚的测试资源验证；上线只读检查可使用已有订单。真实扣款、退款、付费重做和新邮件投递分开验收。
- 单元与集成检查覆盖：普通用户直接请求后台 API、伪造角色、撤销角色立即失效、跨站写入、并发同步、Storage 已有文件后的重试、提交结果未知、价格变更后的旧订单核验。
- 新迁移不删除现有数据；先预览环境验证，再合并 master 触发部署。
- 运行 lint、Next.js 构建、Workers 构建及相关回归测试；本方案仅是设计稿，不代表这些新增功能已实现或通过测试。

## 12. 参考

- 现有订单与资产：D:/codex/songgift/supabase/schema.sql。
- 现有登录边界：D:/codex/songgift/src/lib/auth/server.ts。
- 现有 PayPal：D:/codex/songgift/src/lib/paypal.ts。
- 现有音乐及持久化：D:/codex/songgift/src/app/api/music/route.ts、D:/codex/songgift/src/lib/supabase/song-assets.ts。
- Supabase RLS 与服务端密钥：https://supabase.com/docs/guides/database/postgres/row-level-security。
- Supabase SSR：https://supabase.com/docs/guides/auth/server-side/creating-a-client。
- Cloudflare Cron：https://developers.cloudflare.com/workers/configuration/cron-triggers/。
- PayPal 捕获、退款和查询：https://developer.paypal.com/api/payments/v2。
- PayPal Webhook 验签：https://developer.paypal.com/api/rest/webhooks/rest/。
