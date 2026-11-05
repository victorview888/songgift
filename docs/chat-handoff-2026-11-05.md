# SongGift 聊天交接文档（2026-11-05）

这份文档供新的 Codex 云端任务接手使用。内容来自本聊天和当前仓库核对；不包含密钥。凡涉及线上部署、真实付款或新发布云环境的状态，均按实际验证结果标注。

## 项目目标与入口

- 面向海外用户的英文定制歌曲网站：填写故事 → 生成并确认歌词 → PayPal 付款 → 生成歌曲 → 登录后播放、下载，并通过邮件接收歌曲。
- 正式网站：<https://www.songforalways.com/>；Workers 预览域名：<https://songgift.victorview888.workers.dev/>。
- GitHub：<https://github.com/victorview888/songgift>，本地仓库 `/workspace/songgift`，生产连接分支 `master`。
- Cloudflare Worker 名称为 `songgift`。GitHub `master` 推送按现有连接配置触发 Workers 构建与部署；具体设置见 `docs/cloudflare-deployment.md`。

## 当前代码与技术

- Next.js 16、React 19、vinext 与 Cloudflare Workers Free 承载网站及 API。
- DeepSeek `deepseek-flash` 生成歌词；fal.ai `fal-ai/lyria3/pro` 生成歌曲。MusicAPI.ai 和 Mureka 适配器保留，可切换。当前 `wrangler.jsonc` 选择 `MUSIC_PROVIDER=fal`。
- Supabase Postgres 存储订单与歌曲元数据，私有 Storage `songs` 存储音频；Supabase Auth 用邮箱验证码登录。订单归属、RLS、短时下载链接保护用户歌曲。
- Resend 用于歌曲交付邮件；Supabase 自定义 SMTP 用于注册／登录验证码。此前用户报告发信域名、SMTP 和模板已配置，真实 Gmail 验证码邮件显示 Delivered、登录和 My Songs 已走通。不要把这些历史结果当成最新生产邮件验收。
- 首页、定制表单、歌词确认、支付返回、歌曲结果、登录和 My Songs 均已实现。表单视觉优化与生日、婚礼、纪念日场景页、robots.txt、sitemap.xml 和 SEO 元数据已并入 `master`。后续 SEO 验证项见 `docs/seo-plan.md`。

## PayPal Live 与价格：代码已发布到 GitHub，线上仍需核验

- 用户表示已在 Cloudflare Worker 中把 `PAYPAL_LIVE_CLIENT_ID` 和 `PAYPAL_LIVE_CLIENT_SECRET` 保存为两个加密 Secrets；本聊天无法直接读取其值，也无法证明它们可向 PayPal Live 鉴权。
- `wrangler.jsonc` 当前设置 `PAYPAL_REQUIRED=true`、`PAYPAL_ENVIRONMENT=live`、`PAYPAL_CURRENCY=USD`、`SONG_PRICE_USD=9.99`。Sandbox 凭据使用旧的 `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`；Live 使用独立的 `PAYPAL_LIVE_*` 凭据。
- 已验证的 SongGift 登录邮箱 `victorview888@gmail.com` 由服务器定价为 **USD 1.00**；其他账户保持 **USD 9.99**。价格显示在歌词确认页，创建 PayPal 订单和捕获时都按登录邮箱核对。价格不取自客户端提交的邮箱。规则在 `src/lib/pricing.ts`。
- 付款回跳地址由当前请求域名构造为 `/lyrics/<order-id>`；当前 API 不读取 `PAYPAL_RETURN_URL` 或 `PAYPAL_CANCEL_URL`。
- PayPal Live 代码已快进合并并推送到 GitHub `master`，当前仓库 `HEAD` 为 `24034fc`，本地工作区在编写本文档前干净。`codex/paypal-live-cutover` 已包含在 `master` 中。
- 仅能确认 GitHub 推送与本地构建成功；当前聊天尚未读取 Cloudflare 的部署完成状态，也未做真实 Live 付款或真实歌曲生成验收。

## 最近验证记录

- Live 合并前：11 项 PayPal 回归测试通过，覆盖 Sandbox/Live 凭据选择、订单归属、金额匹配、重复捕获和 USD 1.00 特价；5 项 fal 适配器测试通过。
- ESLint、Next 类型生成与 TypeScript 检查、`npm run build:vinext` Workers 生产构建通过。
- 更早的交接记录称 12 项 Supabase 登录／隔离／RLS／下载集成检查通过，及真实验证码邮件、My Songs 登录通过；本次未重跑这些集成检查。
- 未执行真实小额付款 → 捕获 → 歌曲生成 → 私有音频持久化 → 交付邮件 → 重新登录下载的完整生产链路。

## 当前云环境与网络限制

- 本聊天绑定的旧云环境版本 ID 以 `cecfgver_6adf3e48750c81a0be79bb894bdfdf49` 结尾，修订号 `8`；最近状态为运行中、网络策略已执行。
- 这个**旧实例**生效的出站白名单不含 `x.com`、`songforalways.com`、`www.songforalways.com`、`songgift.victorview888.workers.dev` 或 `api.cloudflare.com`。因此从此聊天无法直接请求这些站点或 Cloudflare 部署 API。
- 旧配置草稿曾包含 `x.com`、`abs.twimg.com`、`pbs.twimg.com`、`video.twimg.com` 和正式站点域名，但与此聊天实例的生效策略不同。用户表示草稿已发布；此聊天仍显示旧版本，**不能据此判定新版本发布失败**。
- 在旧聊天尝试保存 Cloudflare API 访问要求时，配置工具返回 `stale_base` / `CONFLICT`，并明确要求从当前 Environment Settings 新建 setup chat。该次修改没有保存。无密钥方案另见 `/workspace/cloudflare-deployment-access-handoff.md`；跨环境交接以本节和下节为准，不要假设那个本地文件会自动出现在新任务中。
- Cloudflare Worker 的 PayPal Live Secrets 与 Codex 云环境的网络权限、Cloudflare API Token 是三个不同配置。当前旧实例未提供 `CLOUDFLARE_API_TOKEN`。

## 新任务接手顺序

1. 从已发布的 `songgift` 云环境新建任务，选择 `victorview888/songgift`；不要只刷新旧聊天。先用云环境状态工具核对新的配置版本与实际生效域名。若仍无 `x.com` 和正式站点域名，检查是否选错环境或发布尚未完成。
2. 验证正式站点 `https://www.songforalways.com/api/health`：期望 `providers.paypalEnvironment` 为 `live`、`providers.hasPayPalCredentials` 为 `true`，并核对 Supabase 连接和模型提供商。此标志只证明凭据存在，不证明凭据有效。
3. 在 Cloudflare Dashboard 的 `Workers & Pages → songgift → Deployments` 确认提交 `24034fc` 构建并部署成功。若需要从云环境查询 Cloudflare API，需放行 `api.cloudflare.com`，并在 **Codex 云环境**单独配置只读 `CLOUDFLARE_API_TOKEN`；Cloudflare 控制台登录态不会自动进入云端 shell。
4. 进行一次受控的真实 Live 订单验收：以已验证的 SongGift 特价账户看到 USD 1.00，使用**不同于收款商户**的 PayPal 买家账户付款；确认 PayPal 捕获、歌曲生成、Supabase 音频持久化、Resend 交付、退出后重新登录及下载。真实支付与 fal 生成会产生费用；避免重复提交。
5. 若上述验收通过，再验证其他账户显示 USD 9.99、移动端页面、非 Gmail 收件邮箱，以及关闭页面后的生成任务恢复与失败重试。SEO 后续事项见 `docs/seo-plan.md`。

## 相关文件与安全边界

- `wrangler.jsonc`：Worker 公开配置；`src/lib/paypal.ts`、`src/lib/pricing.ts`：PayPal 凭据选择、定价与金额核对。
- `src/app/api/paypal/`：下单和捕获 API；`src/app/api/health/route.ts`：只暴露服务状态与凭据存在与否。
- `supabase/schema.sql`、`docs/user-accounts.md`：数据库、认证、私有订单和音频访问。用户此前报告 schema 已执行，但本文档未重新检查线上数据库结构。
- `docs/cloudflare-deployment.md`：构建、发布、域名及 PayPal Live 切换说明；`docs/seo-plan.md`：SEO 已实现项与后续验证计划。
- 本聊天早期曾出现实际 API 密钥和访问令牌；本文件没有收录任何值。新任务应使用平台现有加密 Secrets，不要从聊天记录复制密钥到代码、文档或日志。
