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

// 范文注入长度上限（字符），避免撑爆上下文
export const SAMPLE_CHAR_LIMIT = 8000;

// ─────────────────────────────────────────
// 周报板块与列：设置页逐项开关，说明文案同时用于 UI 与 prompt
// ─────────────────────────────────────────
export const WEEKLY_SECTIONS = [
  { key: 'overview', name: '本周概览', desc: '开头一段整体叙述：工时投向、重点推进了什么、整体节奏' },
  { key: 'outcomes', name: '关键成果与产出', desc: '从每日记录的「成果/产出」字段提炼，没有成果记录时整段省略' },
  { key: 'risks', name: '问题与风险', desc: '仅提炼工作内容里有明确依据的卡点，没有依据时整段省略' },
];

export const WEEKLY_COLUMNS = [
  { key: 'days', name: '人天', desc: '工作内容表增加「人天」列（工时 ÷ 7.5）' },
  { key: 'share', name: '占比', desc: '工作内容表增加「占比」列（占本周总工时的百分比）' },
  { key: 'priority', name: '优先级', desc: '下周计划表增加「优先级」列' },
  { key: 'deliverable', name: '交付物', desc: '下周计划表增加「交付物」列' },
];

// 生成周报正文时追加的板块要求。sections 为空对象时退回原来的两表结构。
// hasLastPlan 为真时额外要求对照上周计划说明偏差
function weeklySectionRules(sections = {}, hasLastPlan = false) {
  const rules = [];
  if (hasLastPlan) {
    rules.push(`- "本周工作内容"的叙述要对照【上周制定的本周计划】：按计划完成的正常陈述结果；**未达成或方向有变的必须写明"原计划……实际……"及原因**（如依赖外部方进度、优先级调整）。计划与实际一致时不要为凑字数硬加对比`);
  }
  if (sections.overview) {
    rules.push(`- 在问候语之后、"本周工作内容"表格之前，插入 "## 本周概览" 小节：用 2-4 句话说明在管项目共几个、本周核心投入哪几个、取得哪些关键进展。有【本周里程碑】时按事件类型归并成"X 个项目上线、X 个提测、X 个完成需求梳理"这样的摘要。只陈述上方材料里有的事实`);
  }
  if (sections.outcomes) {
    rules.push(`- 在"本周工作内容"表格之后，插入 "## 关键成果与产出" 小节，列表形式。内容来自【本周里程碑】与每日明细中标注了「成果：」的记录，逐条写清交付了什么、达到什么效果；里程碑必须完整体现，不得遗漏。若两者都没有，整个小节省略不输出`);
  }
  if (sections.risks) {
    rules.push(`- 在"关键成果与产出"之后，插入 "## 问题与风险" 小节，列表形式。**只允许写工作内容里有明确文字依据的**卡点（例如记录中出现"卡在""等××方""阻塞""延期""待确认"等表述），每条注明涉及项目与影响。**严禁凭空推测或为凑内容编造风险**；若本周记录中找不到任何此类依据，整个小节省略不输出`);
  }
  return rules;
}

// 本周工作内容表的列定义（随开关增减），供 prompt 与兜底模板共用
export function weeklyTableColumns(sections = {}) {
  return [
    '项目', '工时',
    ...(sections.days ? ['人天'] : []),
    ...(sections.share ? ['占比'] : []),
    '工作内容', '项目进度', '备注',
  ];
}

export function weeklyNextColumns(sections = {}) {
  return [
    '项目', '工作内容',
    ...(sections.priority ? ['优先级'] : []),
    ...(sections.deliverable ? ['交付物'] : []),
  ];
}

// 构建周报生成 prompt。
// template: { sample, instructions }，配置范文后按范文结构生成，否则用默认表格结构
export function buildWeeklyReportPrompt({
  range, pastReports = [], styleRules = [], weekRecords = [], items = [],
  hoursByProject = {}, maintainedStatuses = {}, sections = {},
  allProjects = [], milestones = [], profiles = {}, template, extraMaterial,
}) {
  const sample = (template?.sample || '').trim();
  const useSample = !!sample;
  let prompt = `你是工作周报助手。请根据本周工作记录生成一份专业的中文工作周报。\n\n`;

  if (useSample) {
    const truncated = sample.length > SAMPLE_CHAR_LIMIT;
    prompt += `【格式范文（公司要求的周报样例，请严格模仿其结构、章节划分、篇幅比例和行文风格）】\n`;
    prompt += truncated ? sample.slice(0, SAMPLE_CHAR_LIMIT) + '\n……（范文过长已截断，请以以上部分的结构为准）' : sample;
    prompt += `\n\n`;
    if ((template?.instructions || '').trim()) {
      prompt += `【格式补充说明（必须遵守）】\n${template.instructions.trim()}\n\n`;
    }
  } else if (pastReports.length) {
    // 未配置范文时，用历史周报兜底传递公司写法
    prompt += `【公司周报风格参考 - 请严格模仿以下示例的措辞和表述习惯】\n`;
    pastReports.slice(0, 2).forEach((r, i) => {
      prompt += `\n=== 示例${i + 1}（${r.range}周）===\n${r.markdown}\n`;
    });
    prompt += `\n`;
  }

  // 风格画像已沉淀为规则时注入规则（见 qualityBlock）；冷启动无规则时退回注入最近的修正对比原文
  if (!styleRules.length) {
    const corrections = pastReports.filter(r => r.aiGenerated && r.aiGenerated !== r.markdown).slice(0, 3);
    if (corrections.length) {
      prompt += `【历史修正记录 - 以下是AI生成后用户修改的内容，请学习用户偏好避免重犯】\n`;
      corrections.forEach((r, i) => {
        prompt += `\n修正${i + 1}（${r.range}周）：\nAI生成：\n${r.aiGenerated}\n用户修改为：\n${r.markdown}\n`;
      });
      prompt += `\n`;
    }
  }

  let hasLastPlan = false;
  const lastReport = pastReports[0];
  if (lastReport) {
    prompt += `【上周项目状态参考 - 帮助你理解各项目当前所处阶段】\n`;
    (lastReport.items || []).forEach(it => {
      prompt += `- 项目「${it.project}」上周状态：${it.progress}，内容：${it.content}\n`;
    });
    prompt += `\n`;
    const planned = (lastReport.nextItems || []).filter(it => it.project && it.content);
    if (planned.length) {
      hasLastPlan = true;
      prompt += `【上周制定的本周计划（用于对照实际进展说明达成情况与偏差）】\n`;
      planned.forEach(it => {
        const tail = [it.priority && `优先级${it.priority}`, it.deliverable && `交付物：${it.deliverable}`].filter(Boolean).join('，');
        prompt += `- 项目「${it.project}」：${it.content}${tail ? `（${tail}）` : ''}\n`;
      });
      prompt += `\n`;
    }
  }

  const dailyLines = weekRecords
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project))
    .map(r => `- ${r.date} 项目「${r.project}」：${r.content}${r.outcome ? `（成果：${r.outcome}）` : ''}（${r.hours}h）`)
    .join('\n');
  prompt += `【本周每日工作明细（主要输入，请以此为准整理周报）】\n${dailyLines || '（本周无工作记录）'}\n\n`;

  if (items.length) {
    prompt += `【当前周报草稿（供参考）】\n`;
    prompt += items.map(it => `- 项目「${it.project}」：${it.content}，进度：${it.progress}`).join('\n');
    prompt += `\n\n`;
  }

  // 全部在管项目（含本周无投入的）：领导要看的是项目全景，不是本周流水
  if (allProjects.length) {
    prompt += `【全部在管项目与阶段（人工维护，共 ${allProjects.length} 个）】\n`;
    allProjects.forEach(p => {
      prompt += `- 项目「${p.name}」：${p.progress || '（阶段未维护）'}${p.active ? '（本周有投入）' : '（本周无投入）'}\n`;
    });
    prompt += `\n`;
  }

  if (milestones.length) {
    prompt += `【本周里程碑/关键节点（人工维护，必须完整体现，也是"X 个上线、X 个提测"这类进展摘要的依据）】\n`;
    milestones.forEach(m => {
      prompt += `- ${m.date} 项目「${m.project}」：${m.title}${m.metric ? `（${m.metric}）` : ''}\n`;
    });
    prompt += `\n`;
  }

  const profileLines = (allProjects.length ? allProjects.map(p => p.name) : [...new Set(weekRecords.map(r => r.project))])
    .filter(n => profiles[n] && (profiles[n].goal || profiles[n].background))
    .map(n => `- 项目「${n}」目标：${profiles[n].goal || '（未填）'}${profiles[n].background ? `；背景：${profiles[n].background}` : ''}`)
    .join('\n');
  if (profileLines) prompt += `【项目档案（用于判断进展相对目标处在什么位置）】\n${profileLines}\n\n`;

  const totalHours = Object.values(hoursByProject).reduce((s, h) => s + (h || 0), 0);
  const hoursLines = Object.entries(hoursByProject)
    .sort((a, b) => b[1] - a[1])
    .map(([p, h]) => {
      const extra = [
        sections.days ? `${(h / 7.5).toFixed(1)}人天` : '',
        sections.share && totalHours > 0 ? `占比${Math.round((h / totalHours) * 100)}%` : '',
      ].filter(Boolean).join('，');
      return `- 项目「${p}」：${h}h${extra ? `（${extra}）` : ''}`;
    })
    .join('\n');
  if (hoursLines) prompt += `【本周各项目工时汇总${totalHours ? `（合计 ${totalHours}h）` : ''}】\n${hoursLines}\n\n`;

  // 汇总页人工维护的项目进度：优先级最高，AI 必须原样采用；未维护的项目才由 AI 根据工作内容判断
  const weekProjects = [...new Set(weekRecords.map(r => r.project))];
  const statusLines = weekProjects.filter(p => maintainedStatuses[p]).map(p => `- 项目「${p}」：${maintainedStatuses[p]}`).join('\n');
  if (statusLines) prompt += `【项目进度（人工维护，${useSample ? '表述进度时以此为准' : '必须原样填入"项目进度"列'}，不要改写）】\n${statusLines}\n\n`;

  if ((extraMaterial || '').trim()) {
    prompt += `【补充资料（用户提供的额外背景/数据/要求，请充分利用）】\n${extraMaterial.trim()}\n\n`;
  }

  prompt += qualityBlock(styleRules);

  if (useSample) {
    prompt += `
要求：
1. 全文严格按【格式范文】的结构、章节划分、篇幅比例和行文风格组织；范文中的具体事实、数据、项目名一律不得照抄，内容只能来自上方材料
2. 报告周期为 ${range}；开头问候语与范文保持一致，若范文没有问候语则加上：您好：\n\n本周(${range})的工作总结具体如下，请查收。
3. 人工维护的项目进度必须原样使用，不要改写；范文中若有涵盖全部项目的总览表，用【全部在管项目与阶段】填充，本周无投入的项目也要列出并如实说明本周无进展
4. 【本周里程碑】必须完整体现，不得遗漏
5. 范文中若有计划与实际的对照叙述，参照【上周制定的本周计划】说明达成情况与偏差原因
6. 有数据写数据；材料中没有的不要编造，尤其不要为凑篇幅虚构风险或成果
7. 只输出Markdown内容，不要其他说明`;
  } else {
    const sectionRules = weeklySectionRules(sections, hasLastPlan);
    prompt += `
要求：
1. 开头加上：您好：\n\n本周(${range})的工作总结具体如下，请查收。
2. 生成"本周工作内容"表格，列：${weeklyTableColumns(sections).join(' | ')}（工时填写实际工时，如"9h"${sections.days ? '；人天 = 工时 ÷ 7.5，保留一位小数' : ''}${sections.share ? '；占比用上方汇总给出的百分比' : ''}）
3. "项目进度"列：上方【项目进度（人工维护）】中给出的项目必须原样使用给定值；未给出的项目根据本周工作内容判断（如：需求中/开发中/测试中/已上线/已完成）
4. 生成"下周工作计划"表格，列：${weeklyNextColumns(sections).join(' | ')}（根据本周进展和项目目标合理推测，用户会自行修改${sections.priority ? '；优先级用 高/中/低' : ''}${sections.deliverable ? '；交付物写具体可验收的产出物' : ''}）
${sectionRules.length ? sectionRules.join('\n') + '\n' : ''}${sectionRules.length ? 6 : 5}. 只输出Markdown内容，不要其他说明`;
  }

  return prompt;
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
