import { describe, it, expect } from 'vitest';
import {
  pickChildReports, pickIssues, buildWeeklyReportPrompt, buildLongReportPrompt,
  weeklyTableColumns, weeklyNextColumns, qualityBlock, BANNED_PHRASES, LONG_TYPES, isLongType,
} from './prompts';

const rpt = (type, start, end, markdown = '内容') => ({ type, weekStart: start, weekEnd: end, markdown, range: `${start}~${end}` });

describe('分层选择 pickChildReports', () => {
  const all = [
    rpt('weekly', '2026-06-29', '2026-07-05'),
    rpt('weekly', '2026-07-06', '2026-07-12'),
    rpt('monthly', '2026-07-01', '2026-07-31'),
    rpt('monthly', '2026-08-01', '2026-08-31'),
  ];

  it('季报优先吃月报，不下探到周报', () => {
    const { tierLabel, reports } = pickChildReports(all, 'quarterly', '2026-07-01', '2026-09-30');
    expect(tierLabel).toBe('月报');
    expect(reports).toHaveLength(2);
  });

  it('没有月报时才下探到周报', () => {
    const onlyWeekly = all.filter(r => r.type === 'weekly');
    const { tierLabel, reports } = pickChildReports(onlyWeekly, 'quarterly', '2026-07-01', '2026-09-30');
    expect(tierLabel).toBe('周报');
    expect(reports).toHaveLength(2);
  });

  it('周报按「重叠」匹配（跨期间边界的周不漏）', () => {
    // 6/29~7/5 跨了 6 月与 7 月的边界，做 7 月月报时必须算进来
    const { reports } = pickChildReports(all.filter(r => r.type === 'weekly'), 'monthly', '2026-07-01', '2026-07-31');
    expect(reports.map(r => r.weekStart)).toContain('2026-06-29');
  });

  it('月报及以上按「完全包含」匹配（不把跨季度的月报算进来）', () => {
    const { reports } = pickChildReports(all, 'quarterly', '2026-08-01', '2026-10-31');
    expect(reports.map(r => r.weekStart)).toEqual(['2026-08-01']);
  });

  it('空内容的报告不参与', () => {
    const blank = [{ ...rpt('monthly', '2026-07-01', '2026-07-31'), markdown: '' }];
    expect(pickChildReports(blank, 'quarterly', '2026-07-01', '2026-09-30').reports).toHaveLength(0);
  });

  it('层级配置自洽', () => {
    expect(isLongType('weekly')).toBe(false);
    expect(isLongType('annual')).toBe(true);
    expect(LONG_TYPES.monthly.tier).toBeLessThan(LONG_TYPES.annual.tier);
  });
});

describe('问题台账时间窗 pickIssues', () => {
  const issues = [
    { id: 'open-old',    date: '2026-08-01', title: '未解决的老问题', resolvedDate: '' },
    { id: 'closed-now',  date: '2026-09-02', title: '本周内解决',     resolvedDate: '2026-09-03' },
    { id: 'closed-past', date: '2026-07-01', title: '往期已解决',     resolvedDate: '2026-07-20' },
    { id: 'future',      date: '2026-09-20', title: '期末之后才记录', resolvedDate: '' },
  ];
  const picked = pickIssues(issues, '2026-08-31', '2026-09-06').map(i => i.id);

  it('跟进中的跨周持续出现', () => expect(picked).toContain('open-old'));
  it('本期内解决的带一句收口', () => expect(picked).toContain('closed-now'));
  it('往期已解决的不再重复出现', () => expect(picked).not.toContain('closed-past'));
  it('期末之后记录的不提前出现', () => expect(picked).not.toContain('future'));
  it('按日期升序', () => expect(picked).toEqual(['open-old', 'closed-now']));
  it('空输入安全', () => expect(pickIssues(undefined, '2026-01-01', '2026-12-31')).toEqual([]));
});

describe('周报 prompt 注入', () => {
  const base = { range: '8.31～9.6', weekRecords: [{ date: '2026-08-31', project: 'A', content: '做事', outcome: '交付', hours: 8 }] };

  it('未配范文时用历史周报兜底传递写法', () => {
    const p = buildWeeklyReportPrompt({ ...base, pastReports: [rpt('weekly', '2026-08-24', '2026-08-30', '上周全文')] });
    expect(p).toContain('公司周报风格参考');
    expect(p).toContain('上周全文');
    expect(p).toContain('生成"本周工作内容"表格');
  });

  it('配了范文则改走范文分支，不再注入历史周报当风格参考', () => {
    const p = buildWeeklyReportPrompt({
      ...base,
      pastReports: [rpt('weekly', '2026-08-24', '2026-08-30', '上周全文')],
      template: { sample: '**一、总项目情况**\n并行 7 个项目。', instructions: '不用表格' },
    });
    expect(p).toContain('格式范文');
    expect(p).toContain('并行 7 个项目');
    expect(p).toContain('不用表格');
    expect(p).not.toContain('公司周报风格参考');
  });

  it('超长范文被截断并说明', () => {
    const p = buildWeeklyReportPrompt({ ...base, template: { sample: '甲'.repeat(9000) } });
    expect(p).toContain('范文过长已截断');
  });

  it('注入上周计划，用于「原计划……实际……」对照', () => {
    const last = { ...rpt('weekly', '2026-08-24', '2026-08-30'), nextItems: [{ project: 'A', content: '跟进税局测试' }] };
    const p = buildWeeklyReportPrompt({ ...base, pastReports: [last] });
    expect(p).toContain('上周制定的本周计划');
    expect(p).toContain('跟进税局测试');
    expect(p).toContain('原计划');
  });

  it('上周计划为空时不注入该块，也不要求硬凑对照', () => {
    const last = { ...rpt('weekly', '2026-08-24', '2026-08-30'), nextItems: [{ project: 'A', content: '' }] };
    const p = buildWeeklyReportPrompt({ ...base, pastReports: [last] });
    expect(p).not.toContain('上周制定的本周计划');
  });

  it('项目全景带上人工维护的当前状态，并标注本周无投入', () => {
    const p = buildWeeklyReportPrompt({
      ...base,
      allProjects: [
        { name: 'A', progress: '开发中', statusNote: '', active: true },
        { name: 'OA 合同三期', progress: '前期方案', statusNote: '因税务优先级更高，方案推进暂缓', active: false },
      ],
    });
    expect(p).toContain('当前状态：因税务优先级更高，方案推进暂缓');
    expect(p).toContain('（本周无投入）');
    expect(p).toContain('必须原样采用');
  });

  it('没有任何 statusNote 时不吹嘘「必须原样采用」', () => {
    const p = buildWeeklyReportPrompt({ ...base, allProjects: [{ name: 'A', progress: '开发中', statusNote: '', active: true }] });
    expect(p).toContain('全部在管项目与阶段');
    expect(p).not.toContain('必须原样采用、不要改写');
  });

  it('问题台账原样注入应对进展', () => {
    const p = buildWeeklyReportPrompt({
      ...base,
      issues: [{ project: '二奢对账单', title: '线上线下并行', detail: '数据偏差需排查', resolution: '已反馈财务，待开会', resolvedDate: '' }],
    });
    expect(p).toContain('问题与风险台账');
    expect(p).toContain('应对进展：已反馈财务，待开会');
    expect(p).toContain('（跟进中）');
  });

  it('本期已解决的问题标注收口', () => {
    const p = buildWeeklyReportPrompt({ ...base, issues: [{ project: 'X', title: '老问题', resolution: '', resolvedDate: '2026-09-03' }] });
    expect(p).toContain('（本周已解决）');
  });

  it('有台账时「问题与风险」板块改为以台账为准', () => {
    const withLedger = buildWeeklyReportPrompt({ ...base, sections: { risks: true }, issues: [{ project: 'X', title: 'Y', resolution: '', resolvedDate: '' }] });
    expect(withLedger).toContain('以【问题与风险台账】为准');

    const without = buildWeeklyReportPrompt({ ...base, sections: { risks: true }, issues: [] });
    expect(without).not.toContain('以【问题与风险台账】为准');
    expect(without).toContain('只允许写工作内容里有明确文字依据的');
  });

  it('列开关同时影响表头要求与列定义', () => {
    const p = buildWeeklyReportPrompt({ ...base, sections: { days: true, share: true, priority: true } });
    expect(weeklyTableColumns({ days: true, share: true })).toEqual(['项目', '工时', '人天', '占比', '工作内容', '项目进度', '备注']);
    expect(weeklyNextColumns({ priority: true })).toEqual(['项目', '工作内容', '优先级']);
    expect(p).toContain('人天 = 工时 ÷ 7.5');
  });

  it('每日明细带上成果字段（AI 路径不丢产出信息）', () => {
    const p = buildWeeklyReportPrompt(base);
    expect(p).toContain('（成果：交付）');
  });

  it('禁套话黑名单始终在场', () => {
    const p = buildWeeklyReportPrompt(base);
    BANNED_PHRASES.forEach(w => expect(p).toContain(w));
    expect(qualityBlock(['规则一'])).toContain('规则一');
  });
});

describe('长周期报告 prompt', () => {
  const args = {
    type: 'monthly', label: '2026年8月', childReports: [], childTierLabel: '',
    records: [{ date: '2026-08-03', project: 'A', content: '做事', outcome: '', hours: 8 }],
    milestones: [], profiles: {}, statuses: {}, styleRules: [],
  };

  it('有下级报告时以其为主输入，不再灌全量明细', () => {
    const p = buildLongReportPrompt({ ...args, childReports: [rpt('weekly', '2026-08-03', '2026-08-09', '周报正文')], childTierLabel: '周报' });
    expect(p).toContain('用户已审校，最高优先级输入');
    expect(p).toContain('周报正文');
    expect(p).not.toContain('每日工作明细');
  });

  it('没有下级报告时才灌全量明细', () => {
    const p = buildLongReportPrompt(args);
    expect(p).toContain('每日工作明细');
  });

  it('阶段与当前状态合并成一行注入', () => {
    const p = buildLongReportPrompt({ ...args, statuses: { A: '开发中' }, statusNotes: { A: '一期已上线' } });
    expect(p).toContain('阶段 开发中；当前状态：一期已上线');
  });

  it('问题台账同样注入长周期报告', () => {
    const p = buildLongReportPrompt({ ...args, issues: [{ project: 'A', title: '卡点', detail: '', resolution: '已升级', resolvedDate: '' }] });
    expect(p).toContain('问题与风险台账');
    expect(p).toContain('应对进展：已升级');
  });
});
