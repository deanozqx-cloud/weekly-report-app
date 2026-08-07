// ─────────────────────────────────────────
// AI 生成质量约束与长周期报告 prompt 构建
// ─────────────────────────────────────────
import { escapeCell } from './markdown';


// 无信息量套话黑名单（prompt 中引用）
export const BANNED_PHRASES = ['持续推进', '稳步开展', '有序进行', '积极配合', '不断完善', '稳步推进', '持续优化'];

// 通用质量硬约束块，周报/长周期报告/精修共用。styleRules 为用户风格画像（可为空）
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

// ─────────────────────────────────────────
// 长周期报告类型配置（月报/季报/半年报/年报）
// 分层汇总：每级报告优先以下一级已审校的报告为输入，逐级递归
// ─────────────────────────────────────────
export const LONG_TYPES = {
  monthly:   { name: '月报',   periodWord: '本月',   nextWord: '下月',   tier: 1 },
  quarterly: { name: '季报',   periodWord: '本季度', nextWord: '下季度', tier: 2 },
  half:      { name: '半年报', periodWord: '本阶段', nextWord: '下阶段', tier: 3 },
  annual:    { name: '年报',   periodWord: '本年度', nextWord: '明年',   tier: 4 },
};

export const isLongType = (type) => !!LONG_TYPES[type];

// 在期间内挑选子报告：从紧邻的下一级开始逐级向下找，取第一个非空层级。
// 周报按重叠匹配（周可能跨期间边界），其余层级按完全包含匹配。
export function pickChildReports(allReports, type, start, end) {
  const myTier = LONG_TYPES[type]?.tier ?? 0;
  const candidates = [
    { key: 'half',      label: '半年报' },
    { key: 'quarterly', label: '季报' },
    { key: 'monthly',   label: '月报' },
    { key: 'weekly',    label: '周报' },
  ].filter(c => (LONG_TYPES[c.key]?.tier ?? 0) < myTier);
  for (const c of candidates) {
    const found = allReports
      .filter(r => (r.type || 'weekly') === c.key && r.markdown)
      .filter(r => c.key === 'weekly'
        ? (r.weekStart <= end && r.weekEnd >= start)
        : (r.weekStart >= start && r.weekEnd <= end))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    if (found.length) return { tierLabel: c.label, reports: found };
  }
  return { tierLabel: '', reports: [] };
}

// 范文注入长度上限（字符），避免撑爆上下文
export const SAMPLE_CHAR_LIMIT = 8000;

// 构建长周期报告生成 prompt（月报/季报/半年报/年报通用）。
// template: { sample, instructions }（仅半年报/年报开放，配置范文后按范文格式生成，否则用默认表格格式）
// extraMaterial: 生成时临时粘贴的补充资料（OKR、数据、要求等）
export function buildLongReportPrompt({ type, label, childReports, childTierLabel, records, milestones, profiles, statuses, styleRules, template, extraMaterial }) {
  const cfg = LONG_TYPES[type] || LONG_TYPES.monthly;
  const sample = (template?.sample || '').trim();
  const useSample = !!sample;
  let prompt = `你是工作${cfg.name}助手。请根据以下材料生成一份专业的中文工作${cfg.name}。\n\n`;

  if (useSample) {
    const truncated = sample.length > SAMPLE_CHAR_LIMIT;
    prompt += `【格式范文（往期${cfg.name}，请严格模仿其结构、章节划分、篇幅比例和行文风格）】\n`;
    prompt += truncated ? sample.slice(0, SAMPLE_CHAR_LIMIT) + '\n……（范文过长已截断，请以以上部分的结构为准）' : sample;
    prompt += `\n\n`;
    if ((template?.instructions || '').trim()) {
      prompt += `【格式补充说明（必须遵守）】\n${template.instructions.trim()}\n\n`;
    }
  }

  if (childReports.length) {
    prompt += `【${cfg.periodWord}各${childTierLabel}（用户已审校，最高优先级输入，请以此为准汇总提炼）】\n`;
    childReports.forEach((r, i) => {
      prompt += `\n=== ${childTierLabel}${i + 1}（${r.weekStart} ～ ${r.weekEnd}）===\n${r.markdown || '（无内容）'}\n`;
    });
    prompt += `\n`;
  } else {
    prompt += `【提示】${cfg.periodWord}没有下级报告，请直接根据每日工作明细汇总。\n\n`;
  }

  // 长周期明细可能很多：有子报告时明细仅作补充，只给工时汇总；无子报告时才给全量明细
  if (!childReports.length) {
    const dailyLines = records
      .slice().sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project))
      .map(r => `- ${r.date} 项目「${r.project}」：${r.content}${r.outcome ? `（成果：${r.outcome}）` : ''}（${r.hours}h）`)
      .join('\n');
    prompt += `【${cfg.periodWord}每日工作明细】\n${dailyLines || '（无记录）'}\n\n`;
  }

  if (milestones.length) {
    prompt += `【${cfg.periodWord}里程碑/关键成果（人工维护，必须完整体现在报告中）】\n`;
    milestones.forEach(m => {
      prompt += `- ${m.date} 项目「${m.project}」：${m.title}${m.metric ? `（${m.metric}）` : ''}\n`;
    });
    prompt += `\n`;
  }

  const projectsInPeriod = [...new Set(records.map(r => r.project))];
  const profileLines = projectsInPeriod
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
  if (hoursLines) prompt += `【${cfg.periodWord}各项目工时汇总】\n${hoursLines}\n\n`;

  const statusLines = projectsInPeriod.filter(p => statuses[p]).map(p => `- 项目「${p}」：${statuses[p]}`).join('\n');
  if (statusLines) prompt += `【项目进度（人工维护，${useSample ? '表述进度时以此为准' : '必须原样填入"项目进度"列'}，不要改写）】\n${statusLines}\n\n`;

  if ((extraMaterial || '').trim()) {
    prompt += `【补充资料（用户提供的额外背景/数据/要求，请充分利用）】\n${extraMaterial.trim()}\n\n`;
  }

  prompt += qualityBlock(styleRules);

  if (useSample) {
    prompt += `
要求：
1. 全文严格按【格式范文】的结构、章节划分、篇幅比例和行文风格组织；范文中的具体事实、数据、项目名一律不得照抄，内容只能来自上方材料
2. 报告周期为 ${label}；开头问候语与范文保持一致，若范文没有问候语则加上：您好：\n\n${cfg.periodWord}(${label})的工作总结具体如下，请查收。
3. 人工维护的里程碑必须完整体现；工时占比高的重点项目充分总结（交付了什么、相对项目目标进展如何），琐碎项目合并简写
4. 有数据写数据；材料中没有的不要编造
5. 只输出Markdown内容（以长文本叙述为主，是否使用表格跟随范文），不要其他说明`;
  } else {
    const extraForLong = cfg.tier >= 3
      ? `\n5. 工时占比高的重点项目要充分总结：交付了什么、相对项目目标进展如何；占比很低的琐碎项目可合并简写`
      : '';

    prompt += `
要求：
1. 开头加上：您好：\n\n${cfg.periodWord}(${label})的工作总结具体如下，请查收。
2. 生成"${cfg.periodWord}工作总结"表格，列：项目 | 工时 | 人天 | 主要进展 | 项目进度（主要进展按项目汇总核心工作与结果，不要按${childTierLabel || '周'}流水账；工时/人天用上方汇总数据）
3. 生成"关键成果与里程碑"列表：以人工维护的里程碑为准，可补充从下级报告中提取的重要成果
4. 生成"${cfg.nextWord}工作计划"表格，列：项目 | 工作计划（根据进展和项目目标合理推测，用户会自行修改）${extraForLong}
${cfg.tier >= 3 ? '6' : '5'}. "项目进度"列：人工维护的进度必须原样使用；未提供的项目根据工作内容判断
${cfg.tier >= 3 ? '7' : '6'}. 只输出Markdown内容，不要其他说明`;
  }

  return prompt;
}

// 长周期报告兜底模板（无 AI 或生成失败时的初始内容）
export function generateLongReportTemplate({ type, label, records, milestones }) {
  const cfg = LONG_TYPES[type] || LONG_TYPES.monthly;
  const hoursByProject = {};
  records.forEach(r => { hoursByProject[r.project] = (hoursByProject[r.project] || 0) + r.hours; });

  let md = `您好：\n\n${cfg.periodWord}(${label})的工作总结具体如下，请查收。\n\n`;
  md += `## ${cfg.periodWord}工作总结\n\n| 项目 | 工时 | 人天 | 主要进展 | 项目进度 |\n|------|------|------|----------|----------|\n`;
  Object.entries(hoursByProject).sort((a, b) => b[1] - a[1]).forEach(([p, h]) => {
    md += `| ${escapeCell(p)} | ${h}h | ${(h / 7.5).toFixed(1)} | | |\n`;
  });
  md += `\n## 关键成果与里程碑\n\n`;
  if (milestones.length) {
    milestones.forEach(m => { md += `- ${m.date} ${m.project}：${m.title}${m.metric ? `（${m.metric}）` : ''}\n`; });
  } else {
    md += `- \n`;
  }
  md += `\n## ${cfg.nextWord}工作计划\n\n| 项目 | 工作计划 |\n|------|----------|\n`;
  Object.keys(hoursByProject).forEach(p => { md += `| ${escapeCell(p)} | |\n`; });
  return md;
}
