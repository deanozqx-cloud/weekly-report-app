import { describe, it, expect } from 'vitest';
import {
  escapeCell, splitTableRow, isTableSeparator, mapColumns,
  parseMarkdownToReport, splitSections, proseSections, isTableHeading, PREAMBLE_KEY,
  buildMarkdownTable, buildNextTable, generateReportFromRecords,
  tableRowsToMarkdown, splitContentBlocks, joinContentBlocks,
} from './markdown';

describe('表格单元格与行切分', () => {
  it('escapeCell 与 splitTableRow 对管道符互为逆操作', () => {
    const raw = 'A|B';
    const line = `| ${escapeCell(raw)} | x |`;
    expect(splitTableRow(line)).toEqual(['A|B', 'x']);
  });

  it('保留空单元格，否则后续列会整体错位', () => {
    expect(splitTableRow('| a |  | c |')).toEqual(['a', '', 'c']);
  });

  it('识别表头分隔行', () => {
    expect(isTableSeparator('|------|------|')).toBe(true);
    expect(isTableSeparator('| :---: | ---: |')).toBe(true);
    expect(isTableSeparator('| 项目 | 工时 |')).toBe(false);
  });
});

describe('列名定位（而非固定下标）', () => {
  it('长别名优先：「项目进度」不会被「项目」抢走', () => {
    const cols = mapColumns(['项目', '工时', '工作内容', '项目进度', '备注']);
    expect(cols.project).toBe(0);
    expect(cols.progress).toBe(3);
  });

  it('加列后仍能定位（人天/占比插在中间）', () => {
    const cols = mapColumns(['项目', '工时', '人天', '占比', '工作内容', '项目进度', '备注']);
    expect(cols).toMatchObject({ project: 0, hours: 1, days: 2, share: 3, content: 4, progress: 5, note: 6 });
  });

  it('换序也认得', () => {
    const cols = mapColumns(['项目进度', '项目', '工作内容']);
    expect(cols).toMatchObject({ progress: 0, project: 1, content: 2 });
  });

  it('「主要进展」与「工作计划」都归到 content', () => {
    expect(mapColumns(['项目', '主要进展']).content).toBe(1);
    expect(mapColumns(['项目', '工作计划']).content).toBe(1);
  });
});

describe('parseMarkdownToReport', () => {
  const md = `您好：

## 本周工作内容

| 项目 | 工时 | 人天 | 工作内容 | 项目进度 | 备注 |
|------|------|------|----------|----------|------|
| 渠道税务二期 | 16h | 2.1 | 开发完成并提测 | 开发中 | 待测试资源 |
| 一般贸易记账 | 8h | 1.1 | 流程梳理完成 | 需求中 | |

## 下周工作计划

| 项目 | 工作内容 | 优先级 | 交付物 |
|------|----------|--------|--------|
| 渠道税务二期 | 推动测试资源落实 | 高 | 测试报告 |
`;

  it('按列名读出两张表，含新增的派生列', () => {
    const { items, nextItems } = parseMarkdownToReport(md);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ project: '渠道税务二期', content: '开发完成并提测', progress: '开发中', note: '待测试资源' });
    expect(items[1]).toMatchObject({ project: '一般贸易记账', progress: '需求中', note: '' });
    expect(nextItems).toHaveLength(1);
    expect(nextItems[0]).toMatchObject({ project: '渠道税务二期', content: '推动测试资源落实', priority: '高', deliverable: '测试报告' });
  });

  it('旧格式（无工时列）走位置兜底，不串列', () => {
    const old = `## 本周工作内容

| 项目 | 工作内容 | 项目进度 | 备注 |
|---|---|---|---|
| A | 做了事 | 已上线 | 无 |
`;
    const { items } = parseMarkdownToReport(old);
    expect(items[0]).toMatchObject({ project: 'A', content: '做了事', progress: '已上线', note: '无' });
  });

  it('表头一个列名都认不出时退回固定下标约定', () => {
    const weird = `## 本周工作内容

| 甲 | 乙 | 丙 | 丁 |
|---|---|---|---|
| A | 做了事 | 已上线 | 无 |
`;
    const { items } = parseMarkdownToReport(weird);
    expect(items[0]).toMatchObject({ project: 'A', content: '做了事', progress: '已上线' });
  });

  it('下周计划的空内容行不能被丢弃（兜底模板就是空的）', () => {
    const empty = `## 下周工作计划

| 项目 | 工作内容 |
|---|---|
| A |  |
`;
    expect(parseMarkdownToReport(empty).nextItems).toHaveLength(1);
  });

  it('项目名含「项目」二字的数据行不会被当成表头', () => {
    const tricky = `## 本周工作内容

| 项目 | 工作内容 | 项目进度 |
|---|---|---|
| 项目管理平台 | 做了事 | 开发中 |
`;
    const { items } = parseMarkdownToReport(tricky);
    expect(items).toHaveLength(1);
    expect(items[0].project).toBe('项目管理平台');
  });

  it('空输入不抛错', () => {
    expect(parseMarkdownToReport('')).toEqual({ items: [], nextItems: [] });
    expect(parseMarkdownToReport(undefined)).toEqual({ items: [], nextItems: [] });
  });
});

describe('小节拆分（范文格式的关键）', () => {
  it('第一个 ## 之前的内容进 preamble', () => {
    const { preamble, sections } = splitSections('您好：\n\n开场话\n\n## 本周工作内容\n\n| a |\n');
    expect(preamble).toContain('您好');
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('本周工作内容');
  });

  it('范文用「一、二、」当标题、通篇无 ## 时，整篇都落在 preamble', () => {
    const sample = '领导，您好：\n\n**一、总项目情况**\n\n并行 7 个项目。\n\n**二、本周主要工作内容**\n\n略。';
    const { preamble, sections } = splitSections(sample);
    expect(sections).toHaveLength(0);
    expect(preamble).toContain('一、总项目情况');
    // 这正是「结构化视图一片空白」那个 bug 的回归点：preamble 必须作为可编辑块被取出
    const prose = proseSections(sample);
    expect(prose[0].heading).toBe(PREAMBLE_KEY);
    expect(prose[0].body).toContain('二、本周主要工作内容');
  });

  it('proseSections 排除两张标准表，保留叙述小节', () => {
    const md = '开头\n\n## 本周概览\n\n概览正文\n\n## 本周工作内容\n\n| a |\n\n## 问题与风险\n\n风险正文';
    const headings = proseSections(md).map(s => s.heading);
    expect(headings).toEqual([PREAMBLE_KEY, '本周概览', '问题与风险']);
  });

  it('isTableHeading 认得两张标准表', () => {
    expect(isTableHeading('本周工作内容')).toBe(true);
    expect(isTableHeading('下周工作计划')).toBe(true);
    expect(isTableHeading('问题与风险')).toBe(false);
  });
});

describe('文本块内的表格（范文夹表格）', () => {
  it('拆成段落/表格交替，再拼回不丢内容', () => {
    const text = '前言一段\n\n| 项目 | 阶段 |\n|---|---|\n| A | 开发中 |\n\n后记一段';
    const blocks = splitContentBlocks(text);
    expect(blocks.map(b => b.kind)).toEqual(['text', 'table', 'text']);
    expect(joinContentBlocks(blocks).replace(/\s+/g, ' ')).toContain('开发中');
  });

  it('列数不齐时按最宽行补空，不生成破损表格', () => {
    const md = tableRowsToMarkdown([['a', 'b', 'c'], ['x']]);
    const rows = md.trim().split('\n').filter(l => !isTableSeparator(l)).map(splitTableRow);
    expect(rows[0]).toHaveLength(3);
    expect(rows[rows.length - 1]).toHaveLength(3);
  });
});

describe('生成与回写', () => {
  const records = [
    { id: '1', date: '2026-08-31', project: '渠道税务二期', content: '联调', outcome: '通了', hours: 8 },
    { id: '2', date: '2026-09-01', project: '渠道税务二期', content: '提测', outcome: '', hours: 8 },
    { id: '3', date: '2026-09-02', project: '一般贸易记账', content: '梳理流程', outcome: '', hours: 4 },
  ];

  it('兜底模板按项目归并、带上人工维护的进度', () => {
    const r = generateReportFromRecords('2026-08-31', records, '2026-09-06', { 渠道税务二期: '测试中' });
    expect(r.range).toBe('8.31～9.6');
    expect(r.items).toHaveLength(2);
    const t = r.items.find(i => i.project === '渠道税务二期');
    expect(t.progress).toBe('测试中');                 // 人工维护优先
    expect(t.content).toContain('联调');
    expect(t.content).toContain('提测');                // 同项目多条合并
    const g = r.items.find(i => i.project === '一般贸易记账');
    expect(g.progress).toBe('开发中');                  // 未维护时的默认值
    expect(r.nextItems.map(n => n.project).sort()).toEqual(['一般贸易记账', '渠道税务二期']);
  });

  it('生成的 Markdown 能被自己的解析器读回（往返一致）', () => {
    const r = generateReportFromRecords('2026-08-31', records, '2026-09-06', {});
    const back = parseMarkdownToReport(r.markdown);
    expect(back.items.map(i => i.project).sort()).toEqual(r.items.map(i => i.project).sort());
    expect(back.nextItems).toHaveLength(r.nextItems.length);
  });

  it('表头随开关增减列', () => {
    expect(buildMarkdownTable([], {}, {})).toContain('| 项目 | 工时 | 工作内容 | 项目进度 | 备注 |');
    expect(buildMarkdownTable([], {}, { days: true, share: true })).toContain('人天');
    expect(buildNextTable([], { priority: true })).toContain('优先级');
  });
});
