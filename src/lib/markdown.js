import { uid, getWeekRange, getCustomRange, getSunday } from './utils';

// 表格单元格转义：内容可能来自多行 textarea，含换行或 | 会撕裂表格行。
// 换行折为空格（表格单元格无法承载换行），| 转义为 \|；splitTableRow 负责反转义
export function escapeCell(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function generateReportFromRecords(weekStart, records, weekEnd, projectStatuses, sections) {
  weekEnd = weekEnd || getSunday(weekStart);
  const range = getCustomRange(weekStart, weekEnd);

  const byProject = {};
  records.forEach(r => {
    if (!byProject[r.project]) byProject[r.project] = { recs: [], hours: 0 };
    byProject[r.project].recs.push(r);
    byProject[r.project].hours += r.hours || 0;
  });

  const items = Object.entries(byProject).map(([project, { recs }]) => ({
    id: uid(),
    project,
    content: recs.map(r => r.content).join('；'),
    // 项目进度优先取汇总页维护的状态，未维护时回退默认值
    progress: (projectStatuses && projectStatuses[project]) || '开发中',
    note: '',
  }));

  const hoursByProject = {};
  Object.entries(byProject).forEach(([p, { hours }]) => { hoursByProject[p] = hours; });

  const nextItems = items.map(it => ({
    id: uid(),
    project: it.project,
    content: '',
    priority: '',
    deliverable: '',
  }));

  let md = `您好：\n\n本周(${range})的工作总结具体如下，请查收。\n\n`;
  md += buildMarkdownTable(items, hoursByProject, sections);
  md += `\n${buildNextTable(nextItems, sections)}`;

  return { items, nextItems, markdown: md, weekStart, weekEnd, range };
}

// 一个人天按 7.5 小时折算，与项目汇总页口径一致
export const HOURS_PER_DAY = 7.5;

export function buildMarkdownTable(items, hoursByProject, sections = {}) {
  const hours = hoursByProject || {};
  const total = Object.values(hours).reduce((s, h) => s + (h || 0), 0);
  const head = [
    '项目', '工时',
    ...(sections.days ? ['人天'] : []),
    ...(sections.share ? ['占比'] : []),
    '工作内容', '项目进度', '备注',
  ];
  let md = `## 本周工作内容\n\n`;
  md += `| ${head.join(' | ')} |\n|${head.map(() => '------').join('|')}|\n`;
  items.forEach(it => {
    const h = hours[it.project];
    const cells = [
      escapeCell(it.project),
      h != null ? `${h}h` : '',
      ...(sections.days ? [h != null ? (h / HOURS_PER_DAY).toFixed(1) : ''] : []),
      ...(sections.share ? [h != null && total > 0 ? `${Math.round((h / total) * 100)}%` : ''] : []),
      escapeCell(it.content),
      escapeCell(it.progress),
      escapeCell(it.note),
    ];
    md += `| ${cells.join(' | ')} |\n`;
  });
  return md;
}

export function buildNextTable(nextItems, sections = {}) {
  const head = [
    '项目', '工作内容',
    ...(sections.priority ? ['优先级'] : []),
    ...(sections.deliverable ? ['交付物'] : []),
  ];
  let md = `## 下周工作计划\n\n`;
  md += `| ${head.join(' | ')} |\n|${head.map(() => '------').join('|')}|\n`;
  (nextItems || []).forEach(it => {
    const cells = [
      escapeCell(it.project),
      escapeCell(it.content),
      ...(sections.priority ? [escapeCell(it.priority)] : []),
      ...(sections.deliverable ? [escapeCell(it.deliverable)] : []),
    ];
    md += `| ${cells.join(' | ')} |\n`;
  });
  return md;
}

// 切分 Markdown 表格行为单元格数组：保留空单元格（不能 filter(Boolean)，否则空列导致后续列错位），
// \| 视为单元格内的字面 |（与 escapeCell 配对反转义）
export function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
    else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
    else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

// 是否为表头分隔行，如 | --- | :---: |
export const isTableSeparator = (line) => /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.includes('-');

// 表格列名 → 字段。列是可配置的（人天/占比/优先级/交付物按开关增减），
// 因此按列名定位而非固定下标，加列、换序、旧格式都能正确读回。
const COL_ALIASES = {
  project:     ['项目名称', '项目'],
  hours:       ['工时'],
  days:        ['人天'],
  share:       ['占比'],
  content:     ['工作内容', '主要进展', '工作计划', '内容'],
  progress:    ['项目进度', '项目状态', '进度'],
  note:        ['备注'],
  priority:    ['优先级'],
  deliverable: ['预期交付', '交付物'],
};

// 长别名优先，否则 '项目进度' 会被 '项目' 抢先匹配掉
const ALIAS_INDEX = Object.entries(COL_ALIASES)
  .flatMap(([field, list]) => list.map(alias => ({ field, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function mapColumns(headerCells) {
  const map = {};
  headerCells.forEach((cell, i) => {
    const hit = ALIAS_INDEX.find(x => cell.includes(x.alias));
    if (hit && map[hit.field] == null) map[hit.field] = i;
  });
  return map;
}

// 表头一个列名都没认出来时的兜底，沿用改造前的位置约定
const FALLBACK_COLS = {
  current: { project: 0, content: 1, progress: 2, note: 3 },
  next:    { project: 0, content: 1 },
};

export function parseMarkdownToReport(md) {
  const items = [];
  const nextItems = [];
  const lines = String(md || '').split('\n');
  let section = '';
  let cols = null; // 当前小节表格的列映射，每节第一个表格行是表头
  for (const line of lines) {
    if (line.includes('本周工作内容')) { section = 'current'; cols = null; continue; }
    if (line.includes('下周工作计划')) { section = 'next'; cols = null; continue; }
    if (!section || !line.trim().startsWith('|')) continue;
    if (isTableSeparator(line)) continue;
    const cells = splitTableRow(line);
    if (!cols) {
      const mapped = mapColumns(cells);
      cols = (mapped.project == null && mapped.content == null) ? FALLBACK_COLS[section] : mapped;
      continue;
    }
    if (!cells.some(c => c)) continue; // 全空行跳过
    const at = k => (cols[k] != null ? (cells[cols[k]] || '') : '');
    if (section === 'current') {
      items.push({
        id: uid(),
        project: at('project') || cells[0] || '',
        content: at('content'),
        progress: at('progress') || '开发中',
        note: at('note'),
      });
    } else {
      // 下周计划：内容可为空（模板默认生成空内容行，不能丢弃）
      nextItems.push({
        id: uid(),
        project: at('project') || cells[0] || '',
        content: at('content'),
        priority: at('priority'),
        deliverable: at('deliverable'),
      });
    }
  }
  return { items, nextItems };
}

// 把 Markdown 拆成前言 + 若干 ## 小节，保留原始顺序
export function splitSections(md) {
  const preamble = [];
  const sections = [];
  let cur = null;
  String(md || '').split('\n').forEach(line => {
    if (line.startsWith('## ')) {
      if (cur) sections.push(cur);
      cur = { heading: line.slice(3).trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
    else preamble.push(line);
  });
  if (cur) sections.push(cur);
  return { preamble: preamble.join('\n').trim(), sections };
}

const TABLE_HEADINGS = ['本周工作内容', '下周工作计划'];

export const isTableHeading = (heading) => TABLE_HEADINGS.some(h => String(heading).includes(h));

// 取出 Markdown 里两张表之外的叙述小节（本周概览/关键成果/问题与风险，
// 以及范文产出的自定义小节），供结构化模式渲染成可编辑文本框
export function proseSections(md) {
  return splitSections(md).sections
    .filter(sec => !isTableHeading(sec.heading))
    .map(sec => ({ heading: sec.heading, body: sec.lines.join('\n').trim() }));
}

// 小节在原文中的顺序（含两张表），结构化模式据此排版，
// 使编辑器里看到的顺序与实际输出一致。缺失的表补在末尾。
export function docBlockOrder(md) {
  const seen = new Set();
  const order = [];
  splitSections(md).sections.forEach(sec => {
    // 表格小节按规范名去重（标题可能带前缀），叙述小节按标题本身去重
    const key = TABLE_HEADINGS.find(t => sec.heading.includes(t)) || sec.heading;
    if (seen.has(key)) return;
    seen.add(key);
    order.push(key);
  });
  TABLE_HEADINGS.forEach(t => { if (!seen.has(t)) order.push(t); });
  return order;
}

// 结构化模式回写 Markdown：只重建两张表所在的小节，其余小节原样保留。
// 本周概览/关键成果/问题与风险，以及范文产出的任意自定义小节，
// 都不会在「结构化 ↔ Markdown」来回切换中被抹掉。
// prose：结构化模式下用户编辑过的叙述小节 { 小节标题: 正文 }，覆盖 report.markdown 里的原文。
// 正文被清空的叙述小节整节丢弃——这也是在结构化模式下删掉一个板块的方式。
export function buildMarkdown(report, hoursByProject, sections = {}, prose = null) {
  const range = report.range || getWeekRange(report.weekStart);
  const parsed = splitSections(report.markdown || '');
  const rebuilt = {
    '本周工作内容': buildMarkdownTable(report.items || [], hoursByProject || {}, sections).trimEnd(),
    '下周工作计划': buildNextTable(report.nextItems || [], sections).trimEnd(),
  };
  const out = [parsed.preamble || `您好：\n\n本周(${range})的工作总结具体如下，请查收。`];
  const used = new Set();
  parsed.sections.forEach(sec => {
    const key = TABLE_HEADINGS.find(h => sec.heading.includes(h));
    if (key) {
      if (used.has(key)) return; // 重复小节只保留第一处，避免表格被写两遍
      out.push(rebuilt[key]);
      used.add(key);
    } else {
      const edited = prose && Object.prototype.hasOwnProperty.call(prose, sec.heading);
      const body = String(edited ? prose[sec.heading] : sec.lines.join('\n')).replace(/\s+$/, '');
      if (body.trim()) out.push(`## ${sec.heading}\n${body}`);
    }
  });
  TABLE_HEADINGS.forEach(h => { if (!used.has(h)) out.push(rebuilt[h]); });
  return out.join('\n\n') + '\n';
}

// 富文本复制用的内联样式：粘贴到企业微信/邮件/Word 时不会带上应用的 CSS，
// 表格边框等必须写进 style 属性才能保留
const INLINE_STYLE = {
  h2: 'font-size:15px;font-weight:600;margin:16px 0 8px;color:#1e293b;',
  p: 'margin:6px 0;color:#334155;line-height:1.7;font-size:14px;',
  table: 'border-collapse:collapse;font-size:12px;margin:8px 0 16px;',
  // 表头：浅灰底 + 黑色加粗 14px；边框统一黑灰色；表头与单元格一律左对齐
  th: 'background:#f2f2f2;padding:7px 10px;text-align:left;font-weight:bold;font-size:14px;color:#000000;border:1px solid #595959;',
  // 单元格字号显式写死 12px：Word 等目标环境不总是从 table 继承字号
  td: 'padding:7px 10px;text-align:left;font-size:12px;color:#333333;border:1px solid #595959;vertical-align:top;',
};

export function renderMarkdown(md, { inline = false } = {}) {
  if (!md) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sty = tag => (inline ? ` style="${INLINE_STYLE[tag]}"` : '');
  const lines = md.split('\n');
  const out = [];
  let inTable = false;
  let headerDone = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = esc(raw).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    if (line.startsWith('## ')) {
      if (inTable) { out.push('</table>'); inTable = false; headerDone = false; }
      out.push(`<h2${sty('h2')}>${line.slice(3)}</h2>`);
    } else if (/^\|/.test(line)) {
      if (!inTable) { out.push(`<table${sty('table')}>`); inTable = true; headerDone = false; }
      if (isTableSeparator(line)) { headerDone = true; continue; }
      const cols = splitTableRow(line); // 保留空单元格，避免列错位
      const tag = headerDone ? 'td' : 'th';
      out.push(`<tr>${cols.map(c => `<${tag}${sty(tag)}>${c}</${tag}>`).join('')}</tr>`);
      if (!headerDone) headerDone = true;
    } else {
      if (inTable) { out.push('</table>'); inTable = false; headerDone = false; }
      if (line.trim()) out.push(`<p${sty('p')}>${line}</p>`);
      else out.push('<br>');
    }
  }
  if (inTable) out.push('</table>');
  const body = out.join('');
  return inline
    ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#334155;">${body}</div>`
    : body;
}
