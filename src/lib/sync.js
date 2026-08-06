// ─────────────────────────────────────────
// 分表同步纯函数层：领域对象 ↔ 数据库行 映射、settings 拆合、差量计算
// 全部为纯函数，不依赖 supabase 客户端，可在 Node 中单测
// ─────────────────────────────────────────

const num = (v) => (typeof v === 'string' ? parseFloat(v) || 0 : (v || 0));

// ── 工作记录 ──
export const recordToRow = (userId, r) => ({
  user_id: userId,
  id: r.id,
  date: r.date,
  project: r.project || '',
  content: r.content || '',
  outcome: r.outcome || '',
  hours: num(r.hours),
  created_at: r.createdAt || new Date(0).toISOString(),
});
export const recordFromRow = (row) => ({
  id: row.id,
  date: row.date,
  project: row.project,
  content: row.content,
  outcome: row.outcome || '',
  hours: num(row.hours),
  createdAt: row.created_at,
});

// ── 报告（versions 与瞬态字段 autoAI/autoAIProvider 不入 reports 表） ──
export const reportToRow = (userId, r) => ({
  user_id: userId,
  id: r.id,
  type: r.type || 'weekly',
  period_start: r.weekStart,
  period_end: r.weekEnd,
  range_label: r.range || '',
  markdown: r.markdown || '',
  items: r.items || [],
  next_items: r.nextItems || [],
  ai_generated: r.aiGenerated || '',
  extra_material: r.extraMaterial || '',
  style_distilled_md: r.styleDistilledMd || '',
  generated_at: r.generatedAt || null,
  updated_at: r.updatedAt || new Date(0).toISOString(),
});
export const reportFromRow = (row, versions = []) => ({
  id: row.id,
  type: row.type || 'weekly',
  weekStart: row.period_start,
  weekEnd: row.period_end,
  range: row.range_label,
  markdown: row.markdown,
  items: row.items || [],
  nextItems: row.next_items || [],
  aiGenerated: row.ai_generated || '',
  extraMaterial: row.extra_material || '',
  styleDistilledMd: row.style_distilled_md || '',
  generatedAt: row.generated_at || undefined,
  updatedAt: row.updated_at,
  versions,
});

// ── 报告版本 ──
export const versionToRow = (userId, reportId, v) => ({
  user_id: userId,
  id: v.id,
  report_id: reportId,
  label: v.label || '',
  markdown: v.markdown || '',
  items: v.items || [],
  next_items: v.nextItems || [],
  saved_at: v.savedAt || new Date(0).toISOString(),
});
export const versionFromRow = (row) => ({
  id: row.id,
  label: row.label,
  markdown: row.markdown,
  items: row.items || [],
  nextItems: row.next_items || [],
  savedAt: row.saved_at,
});

// 从报告数组抽取全部版本行
export function extractVersionRows(userId, reports) {
  const rows = [];
  reports.forEach(r => (r.versions || []).forEach(v => rows.push(versionToRow(userId, r.id, v))));
  return rows;
}

// ── settings 拆分：项目（进度+档案）/ 里程碑 / 纯设置 ──
export function settingsToRows(userId, settings = {}) {
  const statuses = settings.projectStatuses || {};
  const profiles = settings.projectProfiles || {};
  const names = [...new Set([...Object.keys(statuses), ...Object.keys(profiles)])];
  const projects = names.map(name => ({
    user_id: userId,
    name,
    progress: statuses[name] || '',
    goal: profiles[name]?.goal || '',
    background: profiles[name]?.background || '',
    milestone_plan: profiles[name]?.milestonePlan || '',
  }));
  const milestones = (settings.milestones || []).map(m => ({
    user_id: userId,
    id: m.id,
    project: m.project || '',
    date: m.date,
    title: m.title || '',
    metric: m.metric || '',
  }));
  const userSettings = {
    user_id: userId,
    llm: settings.llm || {},
    style_rules: settings.styleRules || [],
    report_templates: settings.reportTemplates || {},
    prefs: {
      defaultHours: settings.defaultHours ?? 8,
      progressOptions: settings.progressOptions || [],
      statusOptions: settings.statusOptions || [],
    },
  };
  return { projects, milestones, userSettings };
}

// 分表行 → 应用内 settings 片段（与现有 in-memory 结构一致）
export function settingsFromRows({ projects = [], milestones = [], userSettings = null }) {
  const projectStatuses = {};
  const projectProfiles = {};
  projects.forEach(p => {
    if (p.progress) projectStatuses[p.name] = p.progress;
    if (p.goal || p.background || p.milestone_plan) {
      projectProfiles[p.name] = { goal: p.goal || '', background: p.background || '', milestonePlan: p.milestone_plan || '' };
    }
  });
  const ms = milestones.map(m => ({ id: m.id, project: m.project, date: m.date, title: m.title, metric: m.metric || '' }));
  const frag = { projectStatuses, projectProfiles, milestones: ms };
  if (userSettings) {
    frag.llm = userSettings.llm;
    frag.styleRules = userSettings.style_rules || [];
    frag.reportTemplates = userSettings.report_templates || {};
    const prefs = userSettings.prefs || {};
    if (prefs.defaultHours != null) frag.defaultHours = prefs.defaultHours;
    if (prefs.progressOptions?.length) frag.progressOptions = prefs.progressOptions;
    if (prefs.statusOptions?.length) frag.statusOptions = prefs.statusOptions;
  }
  return frag;
}

// ── 差量：按主键比较两组「行」，返回需要 upsert 的行与需要删除的主键值 ──
export function diffRows(prevRows = [], nextRows = [], key = 'id') {
  const prevMap = new Map(prevRows.map(x => [x[key], JSON.stringify(x)]));
  const nextMap = new Map(nextRows.map(x => [x[key], x]));
  const upserts = [];
  nextMap.forEach((row, k) => {
    if (prevMap.get(k) !== JSON.stringify(row)) upserts.push(row);
  });
  const deletes = [];
  prevMap.forEach((_, k) => { if (!nextMap.has(k)) deletes.push(k); });
  return { upserts, deletes };
}

// ── 计算一次完整同步的差量计划 ──
// prev/next: { workRecords, weeklyReports, settings }（prev 为上次已同步快照，null 视为空）
export function buildSyncPlan(userId, prev, next) {
  const p = prev || { workRecords: [], weeklyReports: [], settings: {} };
  const plan = {};
  plan.workRecords = diffRows(
    p.workRecords.map(r => recordToRow(userId, r)),
    next.workRecords.map(r => recordToRow(userId, r)));
  plan.reports = diffRows(
    p.weeklyReports.map(r => reportToRow(userId, r)),
    next.weeklyReports.map(r => reportToRow(userId, r)));
  plan.versions = diffRows(
    extractVersionRows(userId, p.weeklyReports),
    extractVersionRows(userId, next.weeklyReports));
  const prevS = settingsToRows(userId, p.settings || {});
  const nextS = settingsToRows(userId, next.settings || {});
  plan.projects = diffRows(prevS.projects, nextS.projects, 'name');
  plan.milestones = diffRows(prevS.milestones, nextS.milestones);
  plan.userSettings = JSON.stringify(prevS.userSettings) !== JSON.stringify(nextS.userSettings)
    ? nextS.userSettings : null;
  plan.isEmpty = !plan.workRecords.upserts.length && !plan.workRecords.deletes.length
    && !plan.reports.upserts.length && !plan.reports.deletes.length
    && !plan.versions.upserts.length && !plan.versions.deletes.length
    && !plan.projects.upserts.length && !plan.projects.deletes.length
    && !plan.milestones.upserts.length && !plan.milestones.deletes.length
    && !plan.userSettings;
  return plan;
}
