# SongGift 免费市场雷达

后台入口：`/admin/radar`，继续使用现有已验证邮箱 + 活跃 Owner 权限检查。列表每页 10 份，详情只读，页面继承后台 noindex。刷新按钮重新读取数据库，不触发采集。

## 数据链路

`GitHub Actions 定时采集 → HTTPS 上报接口 → Supabase radar_reports → 后台报告列表 / 详情`

- 工作流：`.github/workflows/radar-free.yml`，每天 UTC 01:30（北京时间 09:30），支持在 master 手动运行。GitHub 可能延迟计划任务；36 小时没有报告时后台提醒检查日志。
- 采集任务与上报任务分开。只有上报任务有 `id-token: write`，不向上游代码提供数据库密钥、OIDC 凭据或业务接口密钥。
- 上游使用 [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar)，固定版本 `fe67ff1acab728141644a4a9741295469b4feee6`（0.6.1），MIT 许可保存在 `third-party/new-term-radar/LICENSE`。通过导入公开模块复用，不执行上游完整 daily 命令。
- 只执行 Hugging Face 热门模型 / Spaces、GitHub 新项目增长、配置站点 Sitemap 差异三个免费模块。未启用 X 抓取、付费搜索量 / 难度、AI 判词、邮件或 Search Console。
- 已核对 GiftSong.ai、The Song For You 与 SongGift 的公开 robots / Sitemap（2026-11-12），只获取公开 XML，不读取歌曲、订单或客户资料。站点拒绝访问时显示失败，保留原快照，不绕过限制。
- 候选模型和项目按歌曲、音乐、音频、歌词、赠礼场景筛选；站点新增页面保留来源链接供人工核对。新增信号不是用户搜索量，不能当作已验证需求。

## 保存与权限

接口 `POST /api/internal/radar/reports` 校验 GitHub 签名的短期 OIDC JWT，无需新增长期共享密钥。只信任 SongGift 仓库 ID `1432492683`、Owner ID `261133674`、master 分支、指定工作流及 GitHub 托管 runner；校验 issuer、audience、过期时间、签名，以及报告与签名里的 run / attempt / commit 一致。

接口只接受规范化 JSON，最大 128 KiB、60 条线索、12 个来源；错误响应不回显凭据。上报按 run ID + attempt 幂等，同编号不同内容拒绝覆盖。JWT 不写入日志或数据库。上报失败重试使用同一份报告，禁止跟随重定向发送凭据。

报告元信息与规范化正文原子保存在同一张专用表 `public.radar_reports`。表开启 RLS，anon / authenticated 没有读写权限；service_role 通过后台权限检查后查询。列表只查询元信息，详情查询结构化正文，以 React 文本渲染，不执行原始 HTML / Markdown。

每次成功上报事务内清理超过 30 天的雷达报告，并限制最多 60 份（采集暂停期间不会额外运行清理任务）。快照保存在 Actions 缓存，报告 artifact 保留 7 天。缓存丢失 / 被回收后会重新建立基线，不伪造新增。原始公开采集结果可能出现在公开仓库的 Actions artifact；不要将 Search Console 等私有数据加入该公开工作流。

## 免费范围

当前仓库为公开仓库，使用标准 GitHub 托管 runner；三个数据来源不需要付费 API。数据库和网站复用 SongGift 现有 Supabase / Cloudflare，不新增服务器或付费服务。仍受现有免费配额、API 限流和 GitHub 缓存 / artifact 政策约束，不承诺无限容量。

## 运维与回退

- GitHub → Actions → SongGift Free Radar → Run workflow（master）。后台若显示部分来源失败，先看来源状态和运行日志，不要把失败当作零新增。
- 新部署首次验证：确认工作流成功、上报返回 201 / 幂等 200、数据库收到真实 run ID，并用现有 Owner 登录后台查看。
- 暂停：在 GitHub 禁用此工作流。页面仍能读取保留的报告。
- 应用回退：回滚本次发布前的 Cloudflare 版本 / Git 提交；独立新增的报告表可以保留，不需要删除或改动歌曲、订单、支付、用户或 Owner 数据。旧应用不访问报告表。
- Schema：迁移 `20261112120927_free_radar_reports.sql`，通过 Supabase 官方 CLI 生成文件名。无破坏性迁移。
