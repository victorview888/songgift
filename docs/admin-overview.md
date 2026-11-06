# 经营概览：第一版

`/admin` 使用模板概览版式和现有后台组件。独立接口为
`GET /api/admin/overview`，页面与接口分别验证当前管理员资格后才查询。
本版只读取原有 song_orders / song_assets，不要求新增数据库迁移。

| 指标 | 口径 | 订单筛选 |
| --- | --- | --- |
| 订单总数 | 全部历史订单，包括草稿 | `/admin/orders` |
| 今日新订单 | 创建时间落在北京时间当天 00:00（含）至次日 00:00（不含） | 同一天的 from/to |
| 已记录付款 | paid_at 非空，包含本地记录中的各支付环境；不是核实的 Live 收入 | `payment=recorded` |
| 有最终音频记录 | 至少一条 is_final=true 资产的订单，按订单去重 | `delivery=delivered` |
| 生成中 | status=generating 且无最终音频记录 | `delivery=generating` |
| 待核查异常 | 无最终音频，且 status=failed/completed 或 generation_error 非空 | `delivery=review` |

概览与列表的异常筛选共用固定谓词，用户不能提供 SQL/OR 表达式。空错误字符串若已
保存在数据库中也属于“非空值”（SQL IS NOT NULL），不擅自推断历史错误是否已解决。
指标可能重叠，不相加；标记生成中不代表本次查询了供应商。资产记录不证明文件可用、
邮件已送达，paid_at 不证明已实时向 PayPal 对账。

统计服务并行发出六次 exact HEAD count，不下载完整订单或音频、不访问新任务/流水表，
也不调用支付商、音乐模型或邮件服务。各项独立读取，不承诺跨查询的事务快照；不据此
计算精确漏斗或比率。固定查询量不受客户端参数控制，响应只有计数、日期、时间及站内链接。

只有成功返回的零计数显示为 0。任何查询失败、缺少计数或异常计数都会使接口返回通用
503；页面显示统计暂不可用并保留订单列表入口。每个响应 private/no-store；页面动态
渲染、noindex，加载/意外错误提示不含身份和统计数据。刷新按钮重新请求服务器，
没有自动轮询。统计异常不会触发付款捕获、歌曲重提或资产恢复。

首版不提供收入、成本、毛利、积分、用户或配置诊断指标。实际付款及任务入口尚未
接入新数据基础，不能将未登记收入显示为零或按订单数乘当前售价推算。

模板来源为 ShrimpReel `e1447714d61eb67af653c931e917dce7b63012b0` 的
`src/routes/admin/index.tsx`，适配映射在 `docs/admin-template-migration.md`，
许可在 `third-party/shrimpreel/LICENSE`。沿用 Next.js SSR，不引入模板客户端请求钩子、
D1 查询或积分/视频核算逻辑。

检查覆盖：内存 PostgreSQL 数据与受控 Supabase HEAD 传输、最终资产去重、午夜边界、
非最终资产、异常与生成中重叠、未知统计不转零、接口鉴权及撤权、数字与列表数量一致、
刷新和窄屏布局。测试传输模拟 PostgREST，不代替真实生产数据库验收。

本版“待核查异常”不自动查询新 generation_jobs 中的 needs_review；新任务入口接入时，
需同步调整概览和订单筛选的共同口径，避免只更新其中一端。
