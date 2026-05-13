# 周报助手 - 项目进度

## 当前状态：阶段三完成 ✅

### 项目地址
- **线上访问**：https://deanozqx-cloud.github.io/weekly-report-app/
- **GitHub 仓库**：https://github.com/deanozqx-cloud/weekly-report-app
- **本地文件**：`/Users/qingxian.zhou/claude/dailywor/dailywork/deploy/index.html`

### 技术栈
- 纯前端单 HTML 文件（React 18 + Tailwind CSS，CDN 引入，无构建工具）
- **认证 + 数据库**：Supabase（新加坡节点，全球可访问）
- **部署**：GitHub Pages（免费）
- **Excel 解析**：SheetJS CDN

### Supabase 配置
- Project URL：`https://qjzzmaqwudawizwkxipc.supabase.co`
- 数据表：`user_data`（jsonb 存储 work_records / weekly_reports）
- RLS：已开启，每用户只能访问自己的数据
- 邮件确认：已关闭（用户注册即登录）

---

## 阶段一：核心功能（已完成）

1. 工作台：日历视图 + 每日工作记录（增删改）
2. 周报管理：按周期生成 + AI 重新生成 + Markdown 编辑
3. 工作明细：搜索、筛选、排序
4. 项目汇总：工时统计图表
5. 设置：多 LLM 配置（DeepSeek / OpenAI / Claude / Kimi 等）
6. 用户登录 / 注册（邮箱 + 密码）
7. 数据云同步（自动防抖 3s 保存，多设备隔离）
8. GitHub Pages 公网部署

---

## 阶段二：UI 优化（已完成）

- 移动端适配：底部 5-Tab 导航、内容区 padding、iOS safe-area
- 工作台日历：移动端点日期后自动折叠，顶部图标可展开
- 周报编辑器：工具栏拆两行，Markdown 独立操作栏，轻量预览渲染器
- 整体视觉：深色渐变侧边栏、蓝紫渐变 Logo、页面切换淡入动画
- 持久登录：onAuthStateChange 统一处理，refresh token 7 天有效

---

## 阶段三：AI 学习优化 + 历史数据导入（已完成）

### AI Few-shot Prompting
AI 生成周报时自动注入三层历史上下文：
1. **风格示例**：最近 2 份有 markdown 的历史周报 → 学习公司措辞和格式习惯
2. **修正对比**：最近 3 份用户修改过的周报（aiGenerated vs markdown）→ 学习用户偏好，避免重犯
3. **项目背景**：上一份周报各项目的进度状态 → 帮 AI 理解项目当前阶段

无历史数据时退化为原有简单 prompt，向后兼容。

### 反馈闭环
- AI 生成时将原始输出保存为 `aiGenerated` 字段
- 用户修改保存后，`markdown ≠ aiGenerated` 即为有效修正样本
- 下次生成时自动将修正对比注入 prompt，AI 逐步学习用户偏好

### 历史数据导入
- 支持上传 Excel（.xlsx / .xls / .csv）
- 自动识别列名（日期、周数、项目、内容、时/工时/小时）
- 支持中文日期格式（如「5月9日」）和 Excel 序列日期
- 按周分组，预览解析结果（显示各周记录数、冲突提示）
- 冲突处理：跳过已有周 / 覆盖已有周
- 导入后同时写入工作记录和周报，周报作为 AI 历史样本

### 其他优化
- 周报列表渲染层强制时间倒序，不依赖存储顺序
- 副标题显示年份（如「2026年」），跨年数据一目了然

---

## 阶段四：汇总页增强（已完成）

- 项目汇总天数改为人天（总工时 / 7.5），移除日均显示
- 汇总总计增加人天数
- 明细列表底部增加总人天
- 点击项目卡片弹出详情弹框，两个 Tab：
  - 工作明细：该项目在日期范围内的所有记录，含合计工时 / 人天
  - 周报记录：包含该项目的历史周报，显示周期、工作内容、项目进度

## 下一步计划（待开发）

- 微信 / 企业微信登录（需 Cloudflare Worker 处理 OAuth 回调）
- 其他待定功能
