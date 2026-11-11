# SongGift 全站 SEO 实施与验收

更新：2026-11-11。正式域名 https://www.songforalways.com，英文站，品牌为 SongGift。
本轮从已发布 `master / 60cca8b` 开发，分支 `codex/seo-pricing-strategy`。
定价决策和竞品来源见 [定价策略](pricing-strategy-2026-11-11.md)。本文件记录代码实施；创建 PR 不等于已经上线。

## 定位与页面分工

主定位是可从个人故事创作的 AI 歌曲礼物。免费部分是歌词预览与编辑；音频在付款后生成。
公开价格来自 `publicSongPriceUsd()`，当前为 US$9.99/首；本轮没有涨价、上线歌曲包或积分。

| 页面 | 主要搜索需求 | 实际回答 |
| --- | --- | --- |
| `/` | personalized song gift / custom song gift | 故事、歌词、付款、歌曲下载的流程及单次价格 |
| `/pricing` | personalized song pricing | 单首包含项、USD/PayPal、免费歌词与付费音频差异、重做和使用范围 |
| `/occasions` | song gifts for occasions | 六种场景的选择指南与入口 |
| `/occasions/birthday` | personalized birthday song | 人物细节、共同回忆、生日愿望和送礼方法 |
| `/occasions/wedding` | personalized wedding song | 相识、日常与承诺，使用前检查播放安排 |
| `/occasions/anniversary` | anniversary song gift | 年份、变化、共同传统与具体回忆 |
| `/occasions/family` | personalized family song | 关系、叙述人称、具体照顾与感谢 |
| `/occasions/pet` | personalized pet song / pet tribute | 宠物习惯、共同经历、庆祝与追思的区别 |
| `/occasions/memorial` | personalized memorial song | 尊重个人意愿的回忆写作与私下赠礼；不声称克隆声音 |
| `/create` | create a personalized song | 实际创作表单与歌词预览入口 |
| `/help`、公开政策 | 品牌帮助与购买信任 | 订单、支付、下载、音频保存和真实政策 |

关键词是页面主题划分，不是搜索量或排名预测。没有填充 meta keywords、批量近似落地页或虚假评价。

## 本轮代码

- `src/lib/seo.ts` 统一公开页 title/description、规范 www HTTPS canonical、Open Graph 与 Twitter 大图。推广参数不会进入 canonical。
- 原创品牌 PNG 分享图 1200×630（约 82 KB）与图标位于 `public/brand`；图中不放易过期价格，不包含客户内容。`scripts/build-brand-assets.mjs` 可从项目原始 SVG 重建；无需运行时图片生成或外部字体请求。
- 首页提供 `Organization` 与 `WebSite` JSON-LD；定价页提供 `Service` 与 `Offer`，直接读取公开价格函数。未生成评分、免费音频、商用授权、未上线套餐或退款承诺。
- `JsonLd` 转义 `<`；所有结构化数据只来自公开配置与编辑内容。Owner 的特殊测试价、邮箱、订单与故事不得写入公开 schema。
- 六种场景页都有独立建议、故事示例、FAQ、赠礼说明及三层面包屑；首页、场景总览、页脚与相关场景互相链接。定价、帮助、开始创作入口清晰可达。
- 修复 `occasions[slug]` 误读原型属性：`__proto__`、`constructor`、`toString` 与普通未知 slug 均走 404；增加符合站点设计的全局找回入口。
- sitemap 从 9 条补至 16 条，包含新增场景总览、三场景及原来遗漏的帮助/退款说明/音频保存说明。不生成虚假的更新时间。
- 登录、账户、订单、歌词、歌曲、后台、联系表单、举报表单仍保持 noindex。robots 保留 `/api/`、`/auth/` 抓取限制，允许爬虫读取后台页面的 noindex；后台鉴权规则不变。
- 未新增数据库迁移、跟踪脚本、公开歌曲/用户内容或搜索引擎提交权限。

## 验证方法

`scripts/test-seo-runtime.mjs` 只允许 loopback，匿名读取页面并在惰性 DOM 中解析服务器 HTML，不执行客户 API。

```bash
SONGGIFT_SEO_URL=http://127.0.0.1:3036 \
SONGGIFT_SEO_EXPECTED_PRICE=9.99 node scripts/test-seo-runtime.mjs
```

对 Next.js 和实际使用的 Workers/vinext 运行时分别执行：

- 全部 16 个 sitemap 页面 200、唯一 title/description、self-canonical、正确分享图及一个 H1；
- PNG 实际尺寸、品牌图标状态、所有 JSON-LD 可解析、公开 Offer 与页面可见金额一致；
- sitemap 不含私人/表单/查询参数 URL，robots 不阻止读取 noindex；
- 10 个私人或表单页面匿名响应 noindex，未知及原型属性路由 404；
- 推广参数 canonical、六场景首页/总览/创作内链与面包屑。

另外检查桌面和手机页面的实际渲染、横向溢出、导航及浏览器错误。验收记录在本轮 PR 中；这不等同于搜索引擎已经收录或提升排名。

2026-11-11 本地结果：ESLint、TypeScript、Next.js webpack 与 Workers 构建通过；两运行时各 39 项 SEO 检查通过。Workers 另通过 1440/390/320px 下的 38 项页面与导航检查，未发现横向溢出、浏览器错误或意外 API 请求。截图和结果保存在工作区 `songgift-seo-preview`，没有使用真实用户、付款、生成或邮件请求。

## 上线后的工作

1. 部署后复查正式域名 HTML、静态图片、sitemap 和私有页 noindex。此次开发前已核实 HTTP/apex 到 www HTTPS、尾斜杠规范化均返回 308。
2. 使用站长账号验证 Google Search Console 与 Bing Webmaster Tools，提交 `https://www.songforalways.com/sitemap.xml`。本环境未连接这些站长账号，不能声称已提交；若选 DNS 验证，需要工具实际具备该域名 DNS 权限。
3. 检查覆盖率、规范网址选择及生日/纪念日等页面的查询与点击；只为有实际需求且能提供独立内容的主题扩展页面。
4. 收集真实移动端 Core Web Vitals（LCP、INP、CLS）的完整观察窗口。一次本地加载不代表线上用户性能；按真实问题优化，不编造 Lighthouse 或排名分数。
5. 发布已经获授权的真实歌曲样例，帮助访客判断交付质量。现有样例配置为空时保持不显示播放器，不公开私人订单音频。

参考：[Google robots 与 noindex](https://developers.google.com/search/docs/crawling-indexing/robots/intro)、[Organization 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/organization)、[规范网址](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)。Service schema 描述服务，不保证触发 Google 商品或 FAQ 富结果。
