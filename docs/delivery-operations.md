# 管理员恢复、自动交付与歌曲通知（T03–T05）

更新：2026-11-06。从 `codex/admin-console` / `bfd6334` 继续。
本轮完成代码和隔离验收，未执行生产迁移、真实 Owner 授权、真实付款/生成/发信或正式发布。

## T03 管理员处理

订单详情增加操作区，接口为 `POST /api/admin/orders/[id]/operations`。
页面读取资料仍无外部调用；明确点击操作按钮后才处理原记录。

| 动作 | 固定原因 | 范围 |
| --- | --- | --- |
| payment.reconcile | manual_check | 按已有报价环境读取 PayPal 订单和完整捕获证据，匹配后登记流水；不会捕获付款 |
| generation.sync | manual_check | 查询已有供应商任务，并使用 T02 的缓存/音频保存和完成事务 |
| generation.resume_storage | recover_delivery | 仅恢复缓存结果/已保存对象；没有结果或源地址过期时先同步原任务 |

请求包含 UUID requestId、动作、固定原因和原任务 jobId。服务端 adminRoute 先验证当前
Owner，再解析参数。beginAdminOperation 重新核对资格、目标归属并持久化请求后才执行；
相同操作者、动作、原因和目标重放同号请求只返回已有审计，requested 也不会自动重做。
网络结果不明时界面保留请求号，先核查同一次处理结果；服务端已确认写入终态后，
下一次明确点击可发起新的处理。

外部查询、下载、上传及完成前再次检查管理员资格；处理中撤权会阻止后续管理员动作，
已开始操作的结果仍可记入审计。审计写入失败即停止，结束写入失败可以留下 requested。
新请求仍需重新通过权限检查。缺少历史报价或可信任务时保持待核实，不推算、不改写
“已付款/已完成”，不退款、不重新生成。订单内显示最近歌曲通知摘要，不返回收件人、
原始供应商响应、租约、输入快照或签名音频地址。

## T04 独立定时 Worker

沿用网站 Next.js/vinext；新增 workers/maintenance.ts 和 wrangler.maintenance.jsonc，
按每分钟一次 Cron 调用同一套任务恢复服务。独立 Worker 的普通 HTTP 请求返回 404，
不增加公开维护接口或网站内 Cron 登录捷径。

- 只处理已登记的 production 生成任务；不会调用预留/生成提交接口。
- 数据库维护租约 10 分钟，阻止重叠 Cron。任务租约延长至 5 分钟，继续与客户轮询和
  管理员操作互斥；过期租约不能登记最终资产。
- 每批至多检查 3 个到期任务、补查 20 个完成通知候选、处理 5 条邮件。90 秒后不再开始
  下一项；已经开始的有超时操作可以继续完成。数据库请求 25 秒，模型请求 30 秒，
  源下载 25 秒、邮件请求 10 秒。
- 排队/处理中正常查询安排 30 秒后的下一次检查；临时故障按 30 秒起指数退避，最多
  30 分钟。45 分钟总时限、90 次自动检查或 8 次连续处理故障后暂停自动处理，保持
  needs_review 和人工核查标记，不判定成供应商失败、不退款、不重发生成。
- 已知任务查询临时失败可重查；提交结果不明且无任务号不重发。音频保存失败保持
  storing 并保留缓存/已上传对象；恢复成功清除原异常。
- songgift_maintenance 保存最近开始/结束、运行结果及本批候选处理数，供后续系统页
  使用。运行成功表示维护过程完成，不等于每笔订单成功、邮件送达或实际供应商查询次数。

用户提交生成任务后关闭页面，Cron 可继续查询和保存；仅付款但尚未提交生成的订单，
不会由 Cron 擅自发起新生成。尚未登记的历史任务仍需另行核实。

## T05 完成通知发件箱

歌曲完成后尝试登记通知；失败不撤销完成事务。Cron 会补查漏记的完成事件。
通知键为 song.ready:jobId，数据库按 jobId 唯一。迁移时保存固定 notification_cutoff，
只登记此时间之后完成的生产任务；重复迁移不重置时间，不批量补发历史歌曲。

收件人取当前订单所属账户的已验证 Supabase Auth 邮箱，不使用未经验证的订单邮箱。
无法确认身份时稍后补查；已删除、未验证或无归属账户会登记跳过，避免阻塞其他候选。
发送前再检查归属和已验证邮箱，变化后跳过。邮件只包含收礼人和稳定的 `/song/id`
登录入口，不含私人故事、歌词或临时音频签名链接。

- 发件箱使用独立 2 分钟租约；发送配置缺失时保留 pending，不消耗处理尝试。
- 首次领取冻结发件人、站点 origin 和模板版本，后续重试使用相同内容和 Resend
  Idempotency-Key。接收成功但响应丢失时，可在服务商去重窗口内安全重试。
- 429/5xx/网络错误按 5、15、45、135 分钟退避，最多 5 次处理尝试；永久拒绝标记 failed，
  幂等冲突标记 needs_review。首次尝试超过 20 小时停止自动投递，留在 Resend 的
  24 小时幂等窗口以内，避免隔日重复投递。
- 发送成功表示邮件服务接受；不证明邮箱送达或用户阅读。发件箱去重不等于所有异常下
  绝对只投递一次；不对超出幂等窗口的未知结果自动重发。

登录验证码继续走现有 Supabase SMTP，与此歌曲通知发件箱分开。当前仅接通歌曲完成
通知，失败通知、管理员告警和手工补发不在本轮范围。

## 数据库与部署准备

新增 `20261106_delivery_operations.sql`，放在 T01/T02 的
`20261106_customer_order_operations.sql` 之后应用；新安装 schema 已同步。
新增表及 RPC 仅 service_role 可用，RLS 对普通角色关闭访问；不授予真实 Owner。
不要重跑旧迁移覆盖更新后的任务函数，也不要删除流水、缓存、通知或音频来回退应用。

网站发布不会自动发布独立 Worker。后续获准部署时分别准备：

| 项目 | 配置 |
| --- | --- |
| 网站 | 现有部署方式；完成入口会登记通知，订单详情提供恢复操作 |
| 定时 Worker | 按 wrangler.maintenance.jsonc 单独部署；SONGGIFT_MAINTENANCE_ENABLED 控制启停 |
| 数据库 | Worker 单独配置 SUPABASE_SERVICE_ROLE_KEY，URL/bucket 与网站目标一致 |
| 音乐 | 为已存任务对应供应商配置 FAL_KEY 等所需凭据；不设置 mock 回退 |
| 通知 | Worker 配置 RESEND_API_KEY、已验证发件人的 SONGGIFT_FROM_EMAIL，以及可信 SONGGIFT_SITE_URL |

凭据通过部署平台 secret 配置，不提交到仓库。未配歌曲通知时，自动音频交付仍可运行，
通知保留等待；配置新 Worker 不会更改 Supabase 登录 SMTP。开发验证使用假凭据，
上述部署、生产迁移和真实邮件投递均尚未执行。

## 验证与复现

- npm run test:delivery：真实内存 PostgreSQL + 假外部服务，覆盖鉴权/撤权、审计失败、
  请求重放、只读付款核实、原任务同步/保存、Cron 互斥/退避/暂停、邮件去重及重试边界。
- npm run test:admin 与 npm run test:customer：保留现有权限、支付、任务和音频回归。
- npm run build:maintenance：Wrangler dry-run，只构建，不发布。
- scripts/test-customer-runtime.mjs serve：仅回环、假 Auth/PostgREST/Storage/音乐服务。
  使用 docs/customer-order-operations.md 中的假环境启动 Next 或本地网站 Worker。
- 本地维护 Worker 也必须使用独立假配置，数据库指向 127.0.0.1:54330，Google 音乐
  endpoint 指向 `/music-fixture`，不配置真实 Resend 密钥；加 --test-scheduled 后，
  本地 `/__scheduled` 用于触发。该模拟入口由 Wrangler 提供，不属于生产 Worker HTTP API。
- scripts/test-delivery-runtime.mjs：通过实际 Next/Workers 接口核对权限、同步、恢复、审计
  及通知状态，并通过真实本地 scheduled handler 验证没有浏览器轮询的交付。
  SONGGIFT_DELIVERY_TEST_URL / SONGGIFT_SCHEDULER_TEST_URL 仅接受回环地址。重建后重启
  本地预览，确保服务端入口和哈希静态资源来自同一构建。
- 两种网站运行时各 8 项交付检查；桌面/手机浏览器分别检查操作、故障恢复、通知摘要
  和窄屏布局。测试音频为人工构造 WAV，邮件发送测试全部为模拟 Resend 响应。

实际 PayPal、音乐供应商、Resend 接受/送达和生成歌曲内容质量仍需后续明确安排验收。


## 首次生产启用（2026-11-09 发布准备）

为先完成网站、数据库和真实链路验证，wrangler.maintenance.jsonc 的
SONGGIFT_MAINTENANCE_ENABLED 默认改为 false。部署维护 Worker 本身不开始处理任务。
只有核对同一 Supabase 目标、供应商密钥、日志和通知配置后，才显式改为 true 并部署/启用。
回退时先关闭该开关并确认没有仍在执行的任务，再处理网站版本；相关租约和流水保留。
客服收信与最终退款条件按用户指示发布验证后补充，音频暂长期保存，不加定期删除任务。
