# 周报助手

全周期工作报告系统：平时记录每日工作，周报/月报/季报/半年报/年报逐级 AI 汇总生成，越用越懂你的写作风格。

**线上地址**：https://deanozqx-cloud.github.io/weekly-report-app/

## 特性

- 📅 工作台：日历（含中国节假日/调休）+ 每日工作记录（含成果/产出）
- 📝 周报：AI 生成 + 风格自学习 + AI 精修 + 版本历史
- 📊 长周期报告：月/季/半年/年报**分层汇总**（每级吃你优化过的下一级报告）
- 🎨 半年报/年报支持**范文格式**（粘贴往年报告，AI 模仿其结构文风）与补充资料投喂
- 📁 项目管理：档案、里程碑、进度双向同步、工时汇总
- ☁️ 云同步：Supabase 分表存储 + RLS + 差量同步，localStorage 离线可用
- 🤖 多 LLM：DeepSeek / OpenAI / Claude / GLM / Kimi / 自定义（API Key 自备）

## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run deploy   # 构建并部署到 GitHub Pages
```

首次部署需在 Supabase 控制台 SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)（幂等）。

## 文档

架构、数据模型、演进史与运维手册见 [PROGRESS.md](PROGRESS.md)。
