import { uid, getWeekRange, getCustomRange, getSunday } from './utils';

export function buildReportPrompt(weekStart, records, defaultHours) {
  const range = getWeekRange(weekStart);
  const lines = records.map(r => `- 项目「${r.project}」：${r.content}（工时${r.hours}h）`).join('\n');
  return `你是一个助手，请根据以下本周工作记录生成一份工作周报（Markdown 格式）。

本周时间范围：${range}
工作记录：
${lines}

要求：
1. 生成"本周工作内容"和"下周工作计划"两个部分
2. 本周工作内容用 Markdown 表格，列为：项目 | 工时 | 工作内容 | 项目进度 | 备注（工时填写实际工时，如"9h"）
3. 下周工作计划也用表格，列为：项目 | 工作内容
4. 在最前面加上问候语：您好：\n\n本周(${range})的工作总结具体如下，请查收。
5. 只输出 Markdown 内容，不要其他说明`;
}

export function generateReportFromRecords(weekStart, records, weekEnd) {
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
    progress: '开发中',
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
    md += `| ${it.project} | ${it.content} |\n`;
  });

  return { items, nextItems, markdown: md, weekStart, weekEnd, range };
}

export function buildMarkdownTable(items, hoursByProject) {
  let md = `## 本周工作内容\n\n`;
  md += `| 项目 | 工时 | 工作内容 | 项目进度 | 备注 |\n|------|------|----------|----------|------|\n`;
  items.forEach(it => {
    const h = hoursByProject && hoursByProject[it.project] != null ? `${hoursByProject[it.project]}h` : '';
    md += `| ${it.project} | ${h} | ${it.content||''} | ${it.progress||''} | ${it.note||''} |\n`;
  });
  return md;
}

export function parseMarkdownToReport(md) {
  const items = [];
  const nextItems = [];
  const lines = md.split('\n');
  let section = '';
  let hasHoursCol = false;
  for (const line of lines) {
    if (line.includes('本周工作内容')) { section = 'current'; continue; }
    if (line.includes('下周工作计划')) { section = 'next'; continue; }
    if (section === 'current' && line.startsWith('|') && line.includes('项目')) {
      hasHoursCol = line.includes('工时');
      continue;
    }
    if (section === 'current' && line.startsWith('|') && !line.includes('---')) {
      const cols = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cols.length >= 2) {
        if (hasHoursCol) {
          items.push({ id: uid(), project: cols[0]||'', content: cols[2]||'', progress: cols[3]||'开发中', note: cols[4]||'' });
        } else {
          items.push({ id: uid(), project: cols[0]||'', content: cols[1]||'', progress: cols[2]||'开发中', note: cols[3]||'' });
        }
      }
    }
    if (section === 'next' && line.startsWith('|') && !line.includes('---') && !line.includes('项目')) {
      const cols = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cols.length >= 2) {
        nextItems.push({ id: uid(), project: cols[0]||'', content: cols[1]||'' });
      }
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
    md += `| ${it.project} | ${it.content||''} |\n`;
  });
  return md;
}

export function renderMarkdown(md) {
  if (!md) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out = [];
  let inTable = false;
  let headerDone = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = esc(raw).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    if (line.startsWith('## ')) {
      if (inTable) { out.push('</table>'); inTable = false; headerDone = false; }
      out.push(`<h2>${line.slice(3)}</h2>`);
    } else if (/^\|/.test(line)) {
      if (!inTable) { out.push('<table>'); inTable = true; headerDone = false; }
      if (/^\|[\s\-|]+$/.test(line)) { headerDone = true; continue; }
      const cols = line.split('|').map(s => s.trim()).filter(Boolean);
      const tag = headerDone ? 'td' : 'th';
      out.push(`<tr>${cols.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`);
      if (!headerDone) headerDone = true;
    } else {
      if (inTable) { out.push('</table>'); inTable = false; headerDone = false; }
      if (line.trim()) out.push(`<p>${line}</p>`);
      else out.push('<br>');
    }
  }
  if (inTable) out.push('</table>');
  return out.join('');
}
