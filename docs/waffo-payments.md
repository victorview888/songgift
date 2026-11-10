# Waffo Pancake 第二支付渠道

开发分支：`codex/waffo-payments`。起点：生产 `d6d11b9`，开始时工作区干净。
用户指定已有单次歌曲产品 `PROD_58CiJH8X22sAkYIJsRjUyy`，不新建产品或订阅。
本次代码默认 `WAFFO_ENABLED=false`；真实商家凭据、Webhook 配置和真实支付尚待验证。

## 用户流程

歌词页按服务端可用配置提供 PayPal / Waffo 单选，沿用订单已冻结的美元报价和现有 Save lyrics 反馈。
Waffo 使用托管收银台；具体银行卡、钱包方式取决于 Waffo 实际开通情况，不承诺所有用户都可用。
传入 `taxIncluded=true` 的 `digital_goods` 价格快照，不开放优惠码以改变冻结金额。
Waffo 可能以当地币种展示并向买家收款，最终金额由收银台说明；本站记录其回调中的美元定价金额。

Waffo 收银台成功页需要买家点击 Done 返回，不是支付后立即自动跳转。
返回地址为 `/lyrics/:orderId?payment=waffo&checkout=:reference`。
页面最多轮询 15 次、间隔 2 秒；延迟时提供再次检查和求助入口，避免重复付款。
返回链接、邮箱或客户端传来的金额都不能授权歌曲生成。服务端确认付款后才调用现有生成入口；
生成租约和重复提交保护保持生效。Webhook 本身不调用模型、发信或退款。

## 配置

在 Cloudflare 网站 Worker 配置以下变量；Merchant ID 和私钥不要提交到 Git 或贴到聊天。

| 变量 | 值 / 来源 |
| --- | --- |
| `WAFFO_ENABLED` | 验证完成前 `false`，最终启用设 `true` |
| `WAFFO_ENVIRONMENT` | `prod` 或 `test`，必须与 API Key、Webhook 环境一致 |
| `WAFFO_PRODUCT_ID` | `PROD_58CiJH8X22sAkYIJsRjUyy`；须为 active 的单次付费产品 |
| `WAFFO_STORE_ID` | Dashboard → Settings → Store Profile 的 `STO_…` |
| `WAFFO_MERCHANT_ID` | Dashboard → API & Development → Create an API Key 上方的 `MER_…` |
| `WAFFO_PRIVATE_KEY` | 同页面创建 API Key 后保存的 RSA PEM 私钥，支持转义换行 |
| `WAFFO_WEBHOOK_PUBLIC_KEY` | 可选。未设置时使用官方 SDK 内置的对应环境验签公钥；密钥轮换时可覆盖 |
| `SONGGIFT_SITE_URL` | `https://www.songforalways.com` |

API Key 自身绑定 test / prod，`X-Environment` 不能替换其环境。
第一版要求 Waffo 环境与订单现有 `payment_environment` 一致，不改写已有报价以切换测试/正式环境。
正式站应使用 prod；端到端测试先在隔离预览同时设置 PayPal sandbox 与 Waffo test。

在对应店铺添加 **HTTP** Webhook：

`https://www.songforalways.com/api/webhooks/waffo`

订阅 `order.completed` 和 `refund.succeeded`；选择与密钥相同的环境。
无需发起真实退款来验证接口，开发阶段使用隔离签名事件。
Dashboard 的 Send Test Event 使用固定样例且以 Test key 签名，不能当作真实订单付款。

## 数据库和发布顺序

先备份生产相关表并确认当前六个迁移均已应用，再通过已连接 Supabase 应用唯一增量迁移：

`supabase/migrations/20261109130330_waffo_payments.sql`

该文件由 Supabase CLI `migration new` 创建。不要重跑安装用 `supabase/schema.sql`。
安装 schema 已同步，增量迁移不改历史报价、PayPal 订单号或音频路径。
新增 `waffo_checkouts`、`waffo_webhook_events`、`payment_capture_reviews` 均启用 RLS，
普通账户和匿名账户无表权限及 RPC 执行权限；服务端 service_role 负责受控操作。

必须先迁移再部署：正常 PayPal 捕获登记现经过新增的原子核查 RPC。
部署后先核对旧 PayPal 流程仍可用，再配置 Waffo 凭据和回调，完成 test 环境验收，
确认产品已发布到生产、店铺已获生产收款资格，最后开启 `WAFFO_ENABLED`。
本任务不改变用户此前暂停的 T06/T08/T09/T10，不启用维护 Worker，不新增退款承诺。

关闭 `WAFFO_ENABLED` 可停止新的 Waffo 下单，已经付款的回调仍按配置环境处理。
已有真实 Waffo 付款后，回退到不识别 Waffo 的旧代码会丢失回调和渠道展示能力；
优先关闭新下单、保留当前回调和账本，不删除新表或真实流水。单纯代码回退不能撤销真实收款。

## 一致性与异常

- 先原子保存付款尝试 UUID，再调用 Waffo；该 UUID 同时作为 `orderMerchantExternalId` 和 SDK 幂等键的一部分。
- 重试复用冻结的产品、邮箱、金额和成功 URL；超时不创建不同引用。到期后可创建新尝试，旧尝试仍可识别。
- SDK `verifyWebhook` 验证原始 body；固定预期环境，使用对应公钥。允许官方 45 分钟重试窗口，并拒绝超前超过 1 分钟的签名。
- 验证店铺、订单引用、状态、真实 chargedAmount / refundedAmount、USD 和金额，不以废弃的 amount / total 填补缺失值。
- 事件、收款/退款流水和订单付款状态在同一个数据库事务提交，成功后才回 200。数据库失败返回可重试错误。
- 同一事件按环境、事件类型和业务事件 ID 去重。哈希不一致拒绝处理。
- 金额不匹配或第二笔 Waffo 收款保留为 `waffo_webhook_events.outcome=needs_review`，并写后台 `payment.review` 事件，不覆盖原收款或再次授权生成。
- 已经 Waffo 付款时，旧 PayPal 页不能请求新的 capture。若捕获恰好并发完成，额外 PayPal 收款证据写 `payment_capture_reviews`，后台显示待核查事件。保留一笔主账本收款，不自动退款。
- 全额退款或异常核查阻止新的生成尝试，不删除既有歌曲音频。回调不替代尚未确定的退款业务规则。
- 付款凭证显示 PayPal / Waffo，帮助页不再只引导用户查 PayPal。

## 验证

`npm run test:payments` 使用真实官方 SDK、隔离 RSA 密钥和 PGlite，不接触生产凭据或资金。
覆盖权限、报价、丢失响应重试、签名/时间/环境、乱序退款、重复通知、跨渠道冲突、全额退款和增量迁移保留旧数据。
Node 24 下显式使用 `--test-isolation=none`，确认输出为实际用例数量，避免仅显示文件级通过而漏跑用例。
桌面/手机浏览器使用本机内存订单及拦截的收银台/生成请求；正式 Waffo 商家 API 及真实资金链路需在配置后验收。

## 官方参考

- [官方集成 Skill](https://docs.waffo.ai/integrate/skill)
- [创建 Checkout Session](https://docs.waffo.ai/api-reference/endpoints/orders/create-checkout-session)
- [Webhook 与重试协议](https://docs.waffo.ai/api-reference/webhooks)
- [本地币种展示与回调币种](https://docs.waffo.ai/features/local-currency)

固定使用官方 `@waffo/pancake-ts@0.28.0`。该版本 SDK 类型遗漏 REST 文档已支持的
`priceSnapshot.taxIncluded`；通过结构化变量传入，保持实际请求包含此字段，测试会核对。

本轮结果：13 项支付测试、102 项相关回归通过；ESLint、TypeScript、Next Webpack 和
Workers 构建通过；桌面与手机浏览器验证通过。两种构建共享生成的路由类型，需依次运行。
生产安全顾问的只读检查仍是既有 service-only 表无 policy 的 INFO、受控历史认领函数提示和
未启用密码泄露保护提示，未改动其设置；新表和新 RPC 的权限在隔离数据库中验证。

2026-11-10 界面同步：共享导航已恢复 Log out，Save lyrics 及保存成功提示移到歌词框下方、
Payment method 上方。沿用已有退出登录和支付确认流程，Waffo 仍等待正式商家配置与验收。
