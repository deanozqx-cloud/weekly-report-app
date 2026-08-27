import { uid, getWeekRange, getCustomRange, getSunday } from './utils';

// 表格单元格转义：内容可能来自多行 textarea，含换行或 | 会撕裂表格行。
// 换行折为空格（表格单元格无法承载换行），| 转义为 \|；splitTableRow 负责反转义
export function escapeCell(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function generateReportFromRecords(weekStart, records, weekEnd, projectStatuses) {
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
  }));

  let md = `您好：\n\n本周(${range})的工作总结具体如下，请查收。\n\n`;
  md += buildMarkdownTable(items, hoursByProject);
  md += `\n## 下周工作计划\n\n`;
  md += `| 项目 | 工作内容 |\n|------|----------|\n`;
  nextItems.forEach(it => {
    md += `| ${escapeCell(it.project)} | ${escapeCell(it.content)} |\n`;
  });

  return { items, nextItems, markdown: md, weekStart, weekEnd, range };
}

export function buildMarkdownTable(items, hoursByProject) {
  let md = `## 本周工作内容\n\n`;
  md += `| 项目 | 工时 | 工作内容 | 项目进度 | 备注 |\n|------|------|----------|----------|------|\n`;
  items.forEach(it => {
    const h = hoursByProject && hoursByProject[it.project] != null ? `${hoursByProject[it.project]}h` : '';
    md += `| ${escapeCell(it.project)} | ${h} | ${escapeCell(it.content)} | ${escapeCell(it.progress)} | ${escapeCell(it.note)} |\n`;
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

export function parseMarkdownToReport(md) {
  const items = [];
  const nextItems = [];
  const lines = md.split('\n');
  let section = '';
  let hasHoursCol = false;
  let headerSeen = false; // 每个 section 内第一个表格行视为表头（不能用 includes('项目') 判断，项目名含"项目"二字的数据行会被误判）
  for (const line of lines) {
    if (line.includes('本周工作内容')) { section = 'current'; headerSeen = false; continue; }
    if (line.includes('下周工作计划')) { section = 'next'; headerSeen = false; continue; }
    if (!section || !line.trim().startsWith('|')) continue;
    if (isTableSeparator(line)) continue;
    if (!headerSeen) {
      // 表头行：本周表检测是否含工时列
      if (section === 'current') hasHoursCol = line.includes('工时');
      headerSeen = true;
      continue;
    }
    const cols = splitTableRow(line);
    if (!cols.some(c => c)) continue; // 全空行跳过
    if (section === 'current') {
      if (hasHoursCol) {
        // 新格式：项目 | 工时 | 工作内容 | 项目进度 | 备注
        items.push({ id: uid(), project: cols[0]||'', content: cols[2]||'', progress: cols[3]||'开发中', note: cols[4]||'' });
      } else {
        // 旧格式：项目 | 工作内容 | 项目进度 | 备注
        items.push({ id: uid(), project: cols[0]||'', content: cols[1]||'', progress: cols[2]||'开发中', note: cols[3]||'' });
      }
    } else {
      // 下周计划：内容可为空（模板默认生成空内容行，不能丢弃）
      nextItems.push({ id: uid(), project: cols[0]||'', content: cols[1]||'' });
    }
  }
  return { items, nextItems };
}

export function buildMarkdown(report, hoursByProject) {
  const range = report.range || getWeekRange(report.weekStart);
  let md = `您好：\n\n本周(${range})的工作总结具体如下，请查收。\n\n`;
  md += buildMarkdownTable(report.items || [], hoursByProject || {});
  md += `\n## 下周工作计划\n\n`;
  md += `| 项目 | 工作内容 |\n|------|----------|\n`;
  (report.nextItems||[]).forEach(it => {
    md += `| ${escapeCell(it.project)} | ${escapeCell(it.content)} |\n`;
  });
  return md;
}

// 富文本复制用的内联样式：粘贴到企业微信/邮件/Word 时不会带上应用的 CSS，
// 表格边框等必须写进 style 属性才能保留
const INLINE_STYLE = {
  h2: 'font-size:15px;font-weight:600;margin:16px 0 8px;color:#1e293b;',
  p: 'margin:6px 0;color:#334155;line-height:1.7;font-size:14px;',
  table: 'border-collapse:collapse;font-size:13px;margin:8px 0 16px;',
  th: 'background:#f1f5f9;padding:7px 10px;text-align:left;font-weight:600;color:#1e293b;border:1px solid #94a3b8;',
  td: 'padding:7px 10px;color:#334155;border:1px solid #cbd5e1;vertical-align:top;',
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
