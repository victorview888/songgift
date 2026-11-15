# 节日创作与首页样曲

日期：2026-11-15。开发分支 `codex/holiday-song-samples-2026-11-15`，基线 master `c9054ca`。无需数据库迁移。

## 节日支持

- 新增 Christmas、Christmas Eve、New Year's Day 三个创建选项；保存的业务值分别为 `Christmas`、`Christmas Eve`、`New Year`，继续经过已有登录、歌词、报价、支付和任务流程。
- 新增 `/occasions/christmas`、`/occasions/christmas-eve`、`/occasions/new-year`，有各自的故事建议、示例、FAQ、metadata 和 breadcrumb。sitemap 由 20 增至 23 个公开 URL。
- 节日页和首页季节卡的创建链接使用 `/create?occasion=<slug>`。只识别以上三个 slug，只预选新故事的场景，不将示例经历或他人姓名填成用户的真实故事。
- 已有本地草稿或已保存歌曲优先恢复，不因点击节日链接而覆盖；提示用户如何选择场景或另起故事。游客草稿在完成登录后绑定当前身份并保留表单内容；其他账号仍按原有规则隔离。
- 首页11月至次年1月1日按日期展示尚未过去的节日；日期年份自动滚动。节日当天仍保留卡片，过期后移除。常驻节日链接、独立指南和创建选项全年可用。
- 不承诺截止日期前必达，不改变实际音乐生成能力、语言或公开价格。

## 三首真实公开样曲

现有应用通过 `SONGGIFT_PUBLIC_SAMPLES` 读取最多三首样曲。本轮增加试听区的购买流程说明和创作入口，继续使用真实音频控件、按需加载、互斥播放及失败重试。

**目前尚未拿到三首可公开音频，因此没有配置假地址、发布测试 WAV、复制竞品歌曲，或自动提取客户订单。** 无有效素材时继续隐藏试听区。用户已收到素材/生成凭据的询问。

优先准备以下三种示例，让普通送礼需求与当前节日都有覆盖：

| 样曲方向 | 曲风 | 可用素材要求 |
| --- | --- | --- |
| Birthday | 明亮 acoustic pop | 自有原创、虚构示例故事，或明确获准公开的成品 |
| Anniversary | 温柔 piano ballad | 同上，姓名与故事公开范围也需确认 |
| Christmas | 温暖 festive acoustic | 原创歌词与旋律，不复制现有圣诞录音或受保护歌词 |

当前生产使用 fal Lyria 3 Pro。本云环境尚未提供该供应商的 `FAL_KEY`；没有把另一模型生成的音频当作当前线上效果。密钥应配置到环境，不进入聊天或仓库。

拿到材料后：验证文件为实际可播放的音频，人工核对内容，将已批准副本放在公开静态样曲路径或明确用于公开展示的媒体地址。不要把带签名的私人订单地址直接提交到配置。逐首检查桌面/手机播放、时长、错误重试及同时只播一首。

配置结构如下，示意路径仅用于文档，需先准备对应文件再启用：

```json
[
  {"title":"A Birthday to Remember","occasion":"Birthday","style":"Acoustic pop","url":"/samples/birthday-demo.mp3"},
  {"title":"All Our Ordinary Days","occasion":"Anniversary","style":"Piano ballad","url":"/samples/anniversary-demo.mp3"},
  {"title":"A Light to Come Home To","occasion":"Christmas","style":"Festive acoustic","url":"/samples/christmas-demo.mp3"}
]
```

三首样曲配置不开放免费个性化音乐生成。用户自己的音频仍在付款后生成；歌曲报价、订单权限和重做权益继续按现有规则。

## 检查

- `node --test --test-isolation=none tests/holidays.test.mjs tests/story-drafts.test.mjs`：季节跨年、当天/过期展示、输入白名单、草稿保存与账号隔离。
- `scripts/test-holidays-browser.mjs`：对本机隔离服务运行，拦截所有业务 API，检查三个节日预选、刷新、已有草稿、游客转登录提交和 1440/390/320px 布局。
- `scripts/test-seo-runtime.mjs`：已扩展到九个场景、23个公开 URL，检查 canonical、JSON-LD、私密页 noindex 与未知 slug。
- Cloudflare 构建与类型检查不需要真实模型、收款或邮件调用。

本轮结果：13 项节日/草稿测试通过；Next.js 与编译后 workerd 各 55 项 SEO 检查、各 15 项浏览器交互检查通过；定向 ESLint、TypeScript 和 Cloudflare 构建通过。类型检查前重新生成了 Next 类型，避免与 vinext 的生成文件混用。已查看桌面与手机截图，未发现横向溢出或脚本异常。测试均未触发真实付款、模型生成或邮件发送。

部署状态和实际样曲准备情况须以交付记录为准，不将代码完成等同于三首音频已上线。
