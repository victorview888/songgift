# Search Console：网页会自动重定向

2026-11-12 收到用户提供的 Google 邮件截图，状态为“网页会自动重定向”。该状态是 Google 对重定向源地址的索引分类，不等于重定向目标也不能收录，更不等于全站故障。Google 官方说明：

- https://support.google.com/webmasters/answer/7440203?hl=zh-Hans#redirect
- https://developers.google.com/search/docs/crawling-indexing/301-redirects

本环境没有 Search Console 已登录会话或连接，无法读取其私人报告中的具体示例 URL，也未执行“验证修复”或“请求编入索引”。邮件没有列出具体地址，因此不能把本次检查发现直接认定为邮件的唯一触发原因。

## 实际检查与修复

生产基线：master `0f3ed42`。核查 sitemap 的 16 个页面、HTTP/HTTPS、裸域名/www 和尾斜杠共 40 个地址变体，并用 Googlebot User-Agent 测试公开页面。16 个规范 HTTPS 页面均直接 200、自指 canonical、允许索引，没有循环跳转或 meta refresh；模拟 UA 不等于来自已验证 Googlebot IP 的实测。

裸域名及尾斜杠变体通过 308 到达规范地址属于有意的统一规则，应保留。检查另发现 `http://www.songforalways.com` 的首页、定价和生日页仍直接 200，缺少 HTTP→HTTPS 永久跳转。

`src/proxy.ts` 补上仅针对 `songforalways.com` 和 `www.songforalways.com` 的 308 规范化，目标固定为 `https://www.songforalways.com`，保留路径及查询参数。HTTPS 正式地址直接放行，localhost、Workers 预览和其他主机不强制跳转。重定向不依赖客户端伪造的 forwarded-host/proto，路径以属性赋值避免 `//` 引入开放重定向；带参数响应禁止缓存。308 保留原请求方法，不更改付款、订单、鉴权或音频规则。

回归覆盖四类主机、查询参数/登录回调、HTTPS 直接访问、预览地址及协议相对路径；再验证 Next.js 与 Workers 构建及运行时。生产发布后复核真实 HTTP/www 为 308→HTTPS 200，全部 16 个规范页继续直接 200，私有页 noindex 与匿名 API 权限不变。需要回退时恢复发布前提交；没有数据库迁移。

## 如何理解报告

如果示例为 `http://songforalways.com/`、`https://songforalways.com/` 或 `/pricing/` 等别名，保留 308，检查其最终 HTTPS/www 目标是否可索引即可。不要为了让报告中“重定向”数量归零而让所有版本返回 200。

在 Search Console 中检查最终规范 URL，例如 `https://www.songforalways.com/`，关注 Google 选择的规范网址、最后抓取时间及真实索引状态。站点地图只提交当前的 HTTPS/www 200 地址。页面允许抓取不代表 Google 一定立即收录；正常别名仍可能继续列在“网页会自动重定向”。若示例是本应直接 200 的规范 URL，需要按具体 URL 继续查，不能仅凭邮件判定已解决。

## 本轮隔离验收

3 项重定向回归、ESLint、TypeScript、Next.js webpack 与 Workers 构建通过；两运行时各 39 项 SEO 检查通过。`scripts/test-canonical-worker.mjs` 直接向 workerd 发送带真实协议和主机的 Request，验证 9 个精确跳转目标、HTTP POST 在业务处理前跳转、重复斜杠始终留在本站，以及规范 HTTPS/本地/预览地址直接 200。此方式避免 Wrangler 开发适配器对 Location 的重写干扰判断。
