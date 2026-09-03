# 周报助手 · 项目档案

> 最后更新：2026-09-02 ｜ 状态：稳定运行
> 线上地址：https://deanozqx-cloud.github.io/weekly-report-app/

从"手写周报的小工具"演进为**全周期工作报告系统**：平时记流水账，报告逐级自动汇总，AI 越用越懂你的写法，年底按公司格式一键出年报，生成完可直接发到收件人邮箱。

---

## 一、产品形态

```
每日记录(+成果) ──→ 周报 ──→ 月报 ──→ 季报 ──→ 半年报/年报
                     │AI生成·风格自学习·AI精修        │范文格式
                     │                              │补充资料
        项目档案 · 里程碑 · 进度双向同步 ──── 逐级注入所有报告
                              ↓
        Supabase 六表(RLS·差量同步·自动迁移) + localStorage 双层存储
                              ↓
              富文本复制 · 数据导出 · SMTP 邮件直发
```

每一级报告以下一级**已人工审校**的报告为最高优先级输入——周报上改的每句话都会向上影响月报直至年报。

### 核心能力

| 模块 | 能力 |
|------|------|
| 工作台 | 日历视图（含中国节假日/调休）、每日记录增删改、可选「成果/产出」字段 |
| 周报 | 按周期生成、AI 生成（注入历史风格/人工维护进度/写作规则）、Markdown/结构化双模编辑、版本历史 |
| 长周期报告 | 月报/季报/半年报/年报，**分层汇总逐级递归**——每级以下一级已人工审校的报告为最高优先级输入 |
| AI 质量 | 禁套话硬约束；**风格画像**（保存修改自动提炼写作规则，最多10条）；**AI 精修**按钮；半年报/年报支持**范文**（模仿往年报告结构文风出长文本）与生成时**补充资料**投喂 |
| 项目汇总 | 工时/人天统计、明细与周报计数、项目档案摘要、行内重命名（级联更新）、进度与周报双向同步、批量设置、里程碑管理 |
| 明细 | 搜索/筛选/排序、总工时与人天 |
| 分发 | 富文本复制（表格样式随剪贴板走）、JSON/Excel 导出（自动剥离 API Key）、SMTP 邮件直发（发送前预览）、收件人通讯录 |
| 设置 | 多 LLM 配置（DeepSeek/OpenAI/Claude/GLM/Kimi/自定义）、AI 写作规则管理、报告模板（范文）、SMTP 配置说明与测试发信、数据管理 |
| 数据 | 历史 Excel 导入（列名自动识别、中文/序列日期、冲突处理）、云端自动同步 |

---

## 二、技术架构

- **前端**：Vite + React 19 + Tailwind CSS（`src/lib` 数据/工具层 + `src/components` 组件层）
- **认证与存储**：Supabase（项目 ref `qjzzmaqwudawizwkxipc`），邮箱密码登录
- **AI**：浏览器直连各家 LLM API（OpenAI 兼容 / Anthropic），Key 由用户自备
- **发信**：Supabase Edge Function（Deno + denomailer），SMTP 凭据只存函数 Secrets，不进前端、不进仓库
- **部署**：GitHub Pages（`npm run deploy` 构建并推送 `gh-pages` 分支）
- **保活**：GitHub Actions 定时任务，防免费版 Supabase 项目 7 天闲置自动暂停

唯一的服务端代码是发信函数——因为 SMTP 凭据不能进浏览器；其余能力都不需要中间层。

### 云端数据模型（v2 分表，`supabase/schema.sql`）

| 表 | 内容 |
|----|------|
| `work_records` | 工作记录（date/project/content/outcome/hours） |
| `reports` | 各类型报告主体（type: weekly/monthly/quarterly/half/annual） |
| `report_versions` | 版本历史（手动保存/AI生成前/精修前/覆盖前快照） |
| `projects` | 项目进度 + 档案（goal/background/milestonePlan） |
| `milestones` | 里程碑记录（date/title/metric） |
| `user_settings` | LLM 配置、写作规则、报告范文、偏好（含邮件设置与收件人通讯录） |

- 全表复合主键 `(user_id, id)` + **RLS**（own rows），旧表 `user_data` 亦有 RLS 兜底
- **差量同步**：与上次同步快照按主键对比，只传变更行；**上行闸门**：初始加载成功前禁止上传
- **自动迁移**：分表为空且 `user_data` 有数据时自动搬迁；未建表时优雅回退旧模式
- `user_data` 保留作迁移前备份（观察稳定后可 `drop table user_data;` 清理）

---

## 三、演进史（12 个阶段，全部合并上线）

| 阶段 | 内容 |
|------|------|
| 1 | 单文件版（原 master）bug 修复：设置持久化损坏（刷新丢 API Key）、Markdown 解析器重写、2025/2026 节假日修正、跨时区偏移、工时回填、Claude CORS 等 20+ 项 |
| 2 | 全部修复移植到 main（Vite 工程）；确立 main 为唯一主线，单文件版归档至 `archive/master-single-file` |
| 3 | AI 调优（硬约束/风格画像/AI精修/成果字段）+ 项目档案/里程碑 + 月报（分层汇总首落地）+ 项目重命名/进度联动 |
| 4 | 汇总页增强（合计吸顶/明细/周报/档案列/行内编辑）+ 进度双向同步 + 设置页四页签全屏重构 |
| 5 | 季报/半年报/年报（分层机制泛化）+ 半年报/年报范文格式 + 补充资料投喂 + 长文本 8192 输出窗口 |
| 6 | 云端存储分表重构：六表 + RLS + 差量同步 + 自动迁移 + 优雅回退 |
| 7 | 同步安全加固：登出清设置（堵跨账号泄露路径）、cloudReady 上行闸门（加载失败不带病上传）、legacy 路径收紧、里程碑日期校验 |
| 8 | autoAI 触发机制重做（key 强制重挂载，根治生成不启动/意外触发/覆盖后旧内容冲掉新报告）、AI 结果即时落库、选中项按类型过滤、`npm run lint` 清零 |
| 9 | 周报合计忠于表格行（表外记录明确提示）、工时改失焦/回车提交；Supabase 保活定时任务（#12、#14） |
| 10 | 富文本复制与数据导出：带内联样式的 HTML 写剪贴板、JSON/Excel 导出、表格样式定稿（表头浅灰底加粗 14px、正文 12px、边框统一黑灰、全部左对齐）（#15、#16） |
| 11 | SMTP 邮件直发：Edge Function 发信 + 发送前预览确认；真机接入后补齐配置容错与证书类错误精准提示（#17、#18） |
| 12 | 收件人通讯录：发送成功后累积地址、三档模糊联想；修复预填地址把自己排除导致下拉恒空的缺陷（#19、#20） |

**质量指标**：ESLint 0 error 基线；解析器/日期工具/分层选择/同步差量/范文注入/通讯录匹配均有 Node 单测；每个阶段完成"合并→构建→部署→线上验证"闭环。

### SMTP 实战接入记录

真机接入自建邮件服务器时逐个撞出来的四关，修复均已固化进代码的错误提示：

| 关卡 | 症状 | 结论 |
|------|------|------|
| 网络可达 | 担心云端机房连不到公司服务器 | 587/465/25 三端口均通 |
| TLS 证书 | `NotValidForName` | 服务商未给本域名配证书，SNI 不匹配时回落到另一租户的证书；改用证书精确匹配的接入域名 |
| 主机名格式 | `invalid char found in FQDN` | 粘贴 Secret 时带了尾空格；已改为读取时统一裁剪（密码除外，见下方取舍） |
| 认证与投递 | — | 一次通过 |

---

## 四、运维手册

```bash
npm run dev      # 本地开发
npm run build    # 构建
npm run lint     # 代码检查（0 error 基线）
npm run deploy   # 构建并部署到 gh-pages（线上更新）

# 发信函数（仅改动 supabase/functions 后需要）
npx supabase@latest functions deploy send-mail
npx supabase@latest secrets list --project-ref qjzzmaqwudawizwkxipc
```

- **数据库初始化/升级**：Supabase 控制台 → SQL Editor → 整段执行 `supabase/schema.sql`（幂等，可重复执行）
- **SMTP 配置**：Supabase 控制台 → Edge Functions → send-mail → Secrets，或用上方 CLI。必填 `SMTP_HOST`，常用 `SMTP_PORT=465` + `SMTP_TLS=implicit` + `SMTP_USER` + `SMTP_PASS`；`SMTP_FROM_NAME` 不配置时发件人显示为邮箱地址
- **分支结构**：`main`（开发主线）/ `gh-pages`（线上站点）/ `archive/master-single-file`（单文件版归档）

## 五、待办

- [ ] Edge Function 的配置容错与错误提示改进**尚未部署**——需 clone 仓库后 `supabase functions deploy send-mail`。不影响现有收发，只影响下次出错时的提示准确度
- [ ] 远程 `master` 分支需在 GitHub 网页删除（Git 中继不允许删分支）
- [ ] 旧表 `user_data` 作为迁移前备份保留中，观察稳定后可 drop

## 六、已知取舍与后续方向

- 多标签页/多设备并发编辑为 last-write-wins（差量分块写入非事务，失败自动重试补齐）——做多人协作时再引入版本仲裁
- LLM API Key 明文存储于 localStorage 与云端 `user_settings`（RLS 保护仅本人可读）——建议使用可轮换的按量 Key
- 汇总页周报计数按"完全包含在日期区间"口径（与详情弹窗一致）
- SMTP 配置项读取时统一 trim，**密码除外**——密码真以空格结尾时静默裁掉会变成查不出原因的认证失败，改为认证失败时提示首尾存在空白
- 通讯录只存地址不存姓名——目前没有可靠的姓名来源，硬编字段是假的；地址的用户名部分已够模糊匹配（子序列匹配让 `zqx` 命中 `zhouqingxian`）
- 收件人输入框保持逗号分隔纯文本而非标签块——代价是观感朴素，换来手动输入与批量粘贴的老用法完全不受影响
- 候选方向：团队/多人共享、服务端定时提醒、资料库与文件上传（docx/pdf 解析）、周报计数跨区间口径可选
