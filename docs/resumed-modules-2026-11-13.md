# 恢复开发：T06 / T08 / T09 / T10

2026-11-13。开发基线为生产 `master / 90c0915`，分支 `codex/admin-gifting-growth`。
用户明确恢复全部四项暂停任务。沿用 SongGift 的权限、支付、生成和组件，不反向迁移模板。
这份记录保留开发完成时的状态。生产迁移与 PR #12 合并已执行，正式发布结果见 [生产执行记录](release-2026-11-13.md)。

## 本次交付

| 任务 | 页面与行为 |
| --- | --- |
| T06 用户 | `/admin/users`，邮箱包含/完整用户 ID、验证状态筛选，每页 20 条，稳定排序，关联订单。账户资料来自 Auth 的安全投影；正式收款订单数只读取 Live 捕获账本。 |
| T06 系统 | `/admin/system`，数据库和私有 Storage 只读探测，部署版本，供应商配置，登录 SMTP/歌曲通知分别说明，维护心跳和最近批次。配置存在不等于供应商可用、Worker 开启或邮件送达。 |
| T06 审计 | `/admin/audit`，管理员、动作、对象 ID/类型、订单、日期、结果筛选和分页；可跳转订单。保留历史 requested 的待核实含义，不支持编辑或清空。 |
| T08 赠礼 | 已付款且有最终音频的订单在歌曲页显示分享设置。默认关闭；勾选分享权限后生成 256 位随机链接，可替换或撤销。收礼人只看到标题、名字、可选祝福（支持换行）和播放器。 |
| T09 内容 | `/guides` 与三篇独立指南：准备故事、核对歌词、赠送歌曲。包含目录、FAQ、相关文章、场景/定价/创建入口、Article/Breadcrumb 结构化数据。站点地图从 16 页增加到 20 页。 |
| T10 统计 | 可选第一方统计，默认关闭；脚注可重新选择/撤回。Owner 在 `/admin/analytics` 查看浏览器事件、首次/最近来源、获准活动标签，及独立的真实捕获/最终音频事实。 |

新后台页面和 API 每次复用 `getAdminPageAccess` / `adminRoute` 检查当前有效 Owner。
沿用现有 AdminShell、筛选、分页、加载/错误状态和样式；共享模板的 MIT 来源说明继续保留。
新业务服务和数据映射为 SongGift 实现。没有迁入 D1、积分、订阅或人工标记收款。

## 赠礼授权与撤销

- 所有私有订单、故事、歌词、账户邮箱、支付资料与 Storage 路径继续留在账户/Owner 权限下。
- 新的 `song_gifts` 只允许服务端访问。`set_songgift_gift` 在同一事务内锁定属于买家的订单并验证付款和最终音频。
- 每次启用/替换生成新的 32 字节随机 token，旧 token 立即失效；GET 不自动启用分享。
- `/gift/[token]` 与 `/api/gifts/[token]/audio` 使用私有不缓存、noindex、no-referrer；赠礼页 CSP 阻止外部脚本/连接读取能力链接。不会加入 sitemap 或自动作为宣传样例。
- 音频经过服务端授权后代理返回，支持单段 byte range，不返回可独立继续使用的 Storage 签名链接；下载后再次检查撤销状态。
- 首版每个音频响应读取一份不超过 32 MiB 的文件。高并发分享前应评估内存、Storage 流量和请求限制；这不是 CDN 公共音频地址。
- 撤销阻止新的资源请求，已缓冲/下载的录音无法撤回。授权绑定买家 ID；买家删除时级联删除授权，订单被转移到其他账号时旧授权也无法访问，之后不能因认领旧订单而复活旧链接。
- 分享设置支持读取已有祝福、复制/预览链接、替换/关闭与错误重试；公开播放器提供失败重试。

## 统计口径与隐私

1. 浏览器只在同意后保存随机 UUID、粗粒度首次/最近来源、渠道、获准活动标签及时间窗口。DNT/GPC 关闭采集。没有第三方付费统计 API。
2. 公开页仅发送分类 `home/create/pricing/occasions/guide/help`；故事、歌词、checkout 的浏览器步骤仅在已有且属于当前用户的订单上关联。不会自动记录赠礼、后台、账户或成品私有路径。
3. 不保存原始 URL/query/referrer、IP、姓名、故事、歌词或邮箱到统计表。服务商正常运行日志不属于这套统计表。
4. `SONGGIFT_ANALYTICS_CAMPAIGNS` 是运营者允许的公开活动 slug 列表；默认不保留任何 `utm_campaign` 值，未知值丢弃，不能用它填写邮箱/客户标识。
5. 访问、故事已保存、歌词就绪、进入收银台是可缺失/可伪造的浏览器事件；收款来自不可变的 `payment_transactions` Live capture，交付事实来自最终音频资产。回跳、按钮或客户端上报均不能生成收款事实。
6. 同意的订单只保留首次来源关联。事件和归因在同一事务写入，重复事件键不重复插入；单浏览器每分钟最多 20 条、全站每日最多 10,000 条。限制/失败不阻断下单流程。
7. 点击不同意/撤回立即停止浏览器采集，再删除当前随机 ID 的事件和来源关联。删除失败保留重试能力；原子撤回记录临时拒收标记，防止在途请求重新写回。真实订单、支付和审计记录不受影响。
8. 浏览器上下文/标识 30 天到期；统计查询只读 30 天内浏览器数据。服务器事件、归因和拒收标记在后续采集时清理过期记录，停止采集时物理删除可能延后，公开隐私说明与此一致。
9. 后台默认最近 7 天、最多 31 天，按北京时间的整日边界筛选。不将“已同意访客”的浏览器事件与“全体订单”的真实记录直接计算为全站转化率或获客成本。

## 新迁移与上线准备（本次未执行）

唯一新文件：`supabase/migrations/20261113100430_admin_gifting_growth.sql`，通过 Supabase CLI `migration new` 生成时间戳；完整 schema 同步更新。

- 账户目录、赠礼授权、使用事件、订单归因和撤回标记均启用 RLS，对 anon/authenticated 撤销访问。
- 所有新 RPC 使用 SECURITY INVOKER，只允许 service_role。Auth 安全投影触发器仅授权 `supabase_auth_admin` 更新必要字段，不复制密码、会话或用户 metadata。
- 用户目录先分页再统计该页订单，提供稳定排序；审计时间/管理员、事件时间/会话、归因清理列均有索引。
- 迁移是增量事务，不修改报价、收款、生成任务或旧音频，不授予新 Owner，不启动后台任务。

后续发布时先备份数据库/私有音频并核对迁移历史，只应用本文件；预发验证 Auth 新建/邮箱验证/登录字段同步，确认 Auth 服务角色可维护目录。
然后部署本分支并验证 Owner/普通用户/匿名访问、赠礼启用/替换/撤销、统计同意/删除和公开 sitemap。

可选非密钥配置：

```dotenv
SONGGIFT_ANALYTICS_CAMPAIGNS=birthday_2026
SONGGIFT_RELEASE_SHA=<实际部署 commit SHA>
```

不需要新增付费 API 或外部统计密钥。未设置发布 SHA 时系统页显示“未上报”。
Waffo Draft #3、真实付款/音乐验收、独立维护 Worker、通知发信与退款决策仍按后续清单处理。

## 回退

回退到本次之前的应用版本即可停用新入口；保留增量表、函数和现有订单资产，不执行删库/删音频。
已有赠礼链接在旧应用中不可用。Auth 目录触发器与旧版本兼容；若它导致认证写入错误，应先用数据库管理角色停用这一个新触发器，再排查：

```sql
drop trigger if exists songgift_admin_directory on auth.users;
```

停用后目录不会继续同步，重新启用前须修复权限并重新同步。不能为回退开放普通用户读权限。
统计撤回删除的是可选统计，不会修改必须保留的真实交易记录。

## 验证

- `node --test --test-isolation=none tests/*.test.mjs`：202 项通过；包含现有付款、任务、草稿、账户、举报、雷达及新模块回归。
- 新增模块在最后的祝福换行校对后另跑 14 项，全部通过。
- `eslint .`、TypeScript 类型检查通过；Next.js 生产构建与 `build:vinext` Cloudflare 构建通过。
- `test-growth-runtime.mjs` 在 Next.js 与真实 workerd 中均通过四组完整验收：Owner/普通账户/匿名与撤权；赠礼开启/旧祝福读取/跨账户拒绝/撤销/Range 音频/错误重试/CSP；统计拒绝/同意/删除；桌面 1440 与手机 390/320 像素。
- `test-seo-runtime.mjs` 在 Next.js 与 workerd 均通过 52 项，覆盖 20 个公开页面、私有 noindex、未知/原型名路径 404、canonical、分享图、JSON-LD、sitemap 与既有定价。
- 增量迁移在隔离 PostgreSQL 验证：既有订单/音频不变，Auth 服务角色同步目录，RLS/函数授权隔离，安全的字面量搜索与分页，Live 事实去重，过期清理与撤回限额；赠礼绑定买家，账号删除后授权消失。

可复现的运行环境：

1. `node scripts/test-customer-runtime.mjs serve`：本机 54330 的模拟 Auth/PostgREST/Storage，使用 PGlite 真正执行 SQL；测试验证码仅为 `123456`。
2. Next.js 本机服务配置 `SUPABASE_URL=http://127.0.0.1:54330`、`SUPABASE_PUBLISHABLE_KEY=isolated-public-key`、`SUPABASE_SERVICE_ROLE_KEY=isolated-service-role`、`LYRICS_PROVIDER=mock`、`MUSIC_PROVIDER=mock`、`SONG_PRICE_USD=9.99`，运行在 `localhost:3002`。
3. 执行 `node scripts/test-growth-runtime.mjs` 及 `SONGGIFT_SEO_URL=http://localhost:3002 node scripts/test-seo-runtime.mjs`。
4. `npm run build:vinext` 后执行 `node scripts/serve-growth-worker.mjs`，再设置测试 URL 为 `http://localhost:3041` 运行相同两套脚本。桥接器按生成配置让 `/_next/static/*` 直接走 ASSETS，动态页面/API 才进入 workerd，避免把未加载客户端 JS 的 SSR 页面误当作通过。
5. Next.js/vinext 共用 `.next/types`；切换构建器后如有生成类型冲突，重新运行 `next typegen`，必要时只清理生成的 `.next/types` / `.next/dev/types`，不改应用类型来绕过。

浏览器截图保存在测试环境 `/tmp/songgift-resumed-preview`，不包含真实客户资料。所有验收使用本机模拟 Auth、支付、供应商和私有 Storage，未下真实订单、生成歌曲或发信。
