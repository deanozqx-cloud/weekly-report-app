# 周报助手 - 项目进度

## 当前状态：阶段二完成 ✅

### 项目地址
- **线上访问**：https://deanozqx-cloud.github.io/weekly-report-app/
- **GitHub 仓库**：https://github.com/deanozqx-cloud/weekly-report-app
- **本地文件**：`/Users/qingxian.zhou/claude/dailywor/dailywork/deploy/index.html`

### 技术栈
- 纯前端单 HTML 文件（React 18 + Tailwind CSS，CDN 引入，无构建工具）
- **认证 + 数据库**：Supabase（新加坡节点，全球可访问）
- **部署**：GitHub Pages（免费）

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

### 移动端适配
- 屏幕宽度 < 768px 时侧边栏隐藏，底部显示 5-Tab 固定导航
- 内容区底部自动 padding 80px 避免被底部导航遮挡
- 支持 iOS safe-area-inset

### 工作台日历交互
- 移动端点击日期后自动折叠日历、显示记录区
- 顶部左侧增加日历图标按钮，可随时展开/收起日历
- 桌面端保持左右分栏不变

### 周报编辑器
- 工具栏拆成两行：
  - 行1：周标题（左） + 保存按钮（右）
  - 行2：AI 选择器 + AI 重新生成 | 结构化 / Markdown 切换（两个控件统一 h-8 等高）
- Markdown 模式下新增独立操作栏（"MARKDOWN" 标签 + 预览 / 复制按钮）
- Markdown 预览功能：点击"预览"渲染表格、标题、段落（自实现轻量渲染器，无额外依赖）
- 移动端周报页：列表与编辑区 Tab 切换，编辑区顶部有"返回列表"按钮

### 整体视觉升级
- Sidebar 改为深色渐变背景（`#1e293b → #0f172a`）
- Logo 和激活导航项改用蓝-紫渐变
- 页面切换加入淡入上移动画（`pageIn 0.18s`）
- 移动端顶栏显示品牌 Logo

### 持久登录
- 改用 `onAuthStateChange` 统一处理所有认证事件，替换原来 `getSession()` + `onAuthStateChange` 双机制
- `INITIAL_SESSION`：页面加载时自动从 localStorage 恢复 session
- `TOKEN_REFRESHED`：access token 每小时自动刷新，维持登录态不中断
- Supabase refresh token 有效期 7 天，正常使用无需频繁重新登录

---

## 下一步计划（待开发）

- 微信 / 企业微信登录（需 Cloudflare Worker 处理 OAuth 回调）
- 其他待定功能
