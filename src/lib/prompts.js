// ─────────────────────────────────────────
// AI 生成质量约束与长周期报告 prompt 构建
// ─────────────────────────────────────────

// 无信息量套话黑名单（prompt 中引用）
export const BANNED_PHRASES = ['持续推进', '稳步开展', '有序进行', '积极配合', '不断完善', '稳步推进', '持续优化'];

// 通用质量硬约束块，周报/月报/精修共用。styleRules 为用户风格画像（可为空）
export function qualityBlock(styleRules = []) {
  let block = `【写作质量硬约束】
- 禁止使用无信息量的套话：${BANNED_PHRASES.join('、')}等
- 每项工作内容必须落到具体动作和结果：做了什么、产出了什么交付物、达到什么效果
- 有数据写数据（数量、耗时、覆盖率等）；没有数据不要编造
- 一句话说得清的不要拆成两句，宁可短而实，不要长而虚
`;
  if (styleRules.length) {
    block += `\n【用户写作规则（从历史修改中学习，必须遵守）】\n${styleRules.map(r => `- ${r}`).join('\n')}\n`;
  }
  return block;
}

// 构建月报生成 prompt（分层汇总：以该月各周报为主要输入）
export function buildMonthlyPrompt({ year, month, weeklyInPeriod, records, milestones, profiles, statuses, styleRules }) {
  const label = `${year}年${month}月`;
  let prompt = `你是工作月报助手。请根据以下材料生成一份专业的中文工作月报。\n\n`;

  if (weeklyInPeriod.length) {
    prompt += `【本月各周周报（用户已审校，最高优先级输入，请以此为准汇总提炼）】\n`;
    weeklyInPeriod.forEach((r, i) => {
      prompt += `\n=== 第${i + 1}周（${r.weekStart} ～ ${r.weekEnd}）===\n${r.markdown || '（无内容）'}\n`;
    });
    prompt += `\n`;
  } else {
    prompt += `【提示】本月没有周报，请直接根据下方每日工作明细汇总。\n\n`;
  }

  const dailyLines = records
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project))
    .map(r => `- ${r.date} 项目「${r.project}」：${r.content}${r.outcome ? `（成果：${r.outcome}）` : ''}（${r.hours}h）`)
    .join('\n');
  prompt += `【本月每日工作明细（补充参考）】\n${dailyLines || '（无记录）'}\n\n`;

  if (milestones.length) {
    prompt += `【本月里程碑/关键成果（人工维护，必须完整体现在月报中）】\n`;
    milestones.forEach(m => {
      prompt += `- ${m.date} 项目「${m.project}」：${m.title}${m.metric ? `（${m.metric}）` : ''}\n`;
    });
    prompt += `\n`;
  }

  const projectsInMonth = [...new Set(records.map(r => r.project))];
  const profileLines = projectsInMonth
    .filter(p => profiles[p] && (profiles[p].goal || profiles[p].background))
    .map(p => `- 项目「${p}」目标：${profiles[p].goal || '（未填）'}${profiles[p].background ? `；背景：${profiles[p].background}` : ''}`)
    .join('\n');
  if (profileLines) prompt += `【项目档案（用于评估进展是否达成目标）】\n${profileLines}\n\n`;

  const hoursByProject = {};
  records.forEach(r => { hoursByProject[r.project] = (hoursByProject[r.project] || 0) + r.hours; });
  const hoursLines = Object.entries(hoursByProject)
    .sort((a, b) => b[1] - a[1])
    .map(([p, h]) => `- 项目「${p}」：${h}h / ${(h / 7.5).toFixed(1)}人天`)
    .join('\n');
  if (hoursLines) prompt += `【本月各项目工时汇总】\n${hoursLines}\n\n`;

  const statusLines = projectsInMonth.filter(p => statuses[p]).map(p => `- 项目「${p}」：${statuses[p]}`).join('\n');
  if (statusLines) prompt += `【项目进度（人工维护，必须原样填入"项目进度"列，不要改写）】\n${statusLines}\n\n`;

  prompt += qualityBlock(styleRules);

  prompt += `
要求：
1. 开头加上：您好：\n\n本月(${label})的工作总结具体如下，请查收。
2. 生成"本月工作总结"表格，列：项目 | 工时 | 人天 | 主要进展 | 项目进度（主要进展按项目汇总当月核心工作与结果，不要按周流水账；工时/人天用上方汇总数据）
3. 生成"关键成果与里程碑"列表：以人工维护的里程碑为准，可补充从周报中提取的重要成果
4. 生成"下月工作计划"表格，列：项目 | 工作计划（根据本月进展和项目目标合理推测，用户会自行修改）
5. "项目进度"列：人工维护的进度必须原样使用；未提供的项目根据工作内容判断
6. 只输出Markdown内容，不要其他说明`;

  return prompt;
}

// 月报兜底模板（无 AI 或生成失败时的初始内容）
export function generateMonthlyTemplate({ year, month, records, milestones }) {
  const label = `${year}年${month}月`;
  const hoursByProject = {};
  records.forEach(r => { hoursByProject[r.project] = (hoursByProject[r.project] || 0) + r.hours; });

  let md = `您好：\n\n本月(${label})的工作总结具体如下，请查收。\n\n`;
  md += `## 本月工作总结\n\n| 项目 | 工时 | 人天 | 主要进展 | 项目进度 |\n|------|------|------|----------|----------|\n`;
  Object.entries(hoursByProject).sort((a, b) => b[1] - a[1]).forEach(([p, h]) => {
    md += `| ${p} | ${h}h | ${(h / 7.5).toFixed(1)} | | |\n`;
  });
  md += `\n## 关键成果与里程碑\n\n`;
  if (milestones.length) {
    milestones.forEach(m => { md += `- ${m.date} ${m.project}：${m.title}${m.metric ? `（${m.metric}）` : ''}\n`; });
  } else {
    md += `- \n`;
  }
  md += `\n## 下月工作计划\n\n| 项目 | 工作计划 |\n|------|----------|\n`;
  Object.keys(hoursByProject).forEach(p => { md += `| ${p} | |\n`; });
  return md;
}
