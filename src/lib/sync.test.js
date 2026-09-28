import { describe, it, expect } from 'vitest';
import {
  recordToRow, recordFromRow, reportToRow, reportFromRow,
  settingsToRows, settingsFromRows, diffRows, buildSyncPlan, extractVersionRows,
} from './sync';

const U = 'user-1';

describe('行映射往返', () => {
  it('工作记录往返一致，hours 字符串被规范成数字', () => {
    const r = { id: 'r1', date: '2026-08-31', project: 'A', content: 'c', outcome: 'o', hours: '7.5', createdAt: '2026-08-31T00:00:00.000Z' };
    const back = recordFromRow(recordToRow(U, r));
    expect(back).toMatchObject({ id: 'r1', project: 'A', outcome: 'o', hours: 7.5 });
  });

  it('报告往返一致，versions 与瞬态字段不入主表', () => {
    const rep = {
      id: 'p1', type: 'weekly', weekStart: '2026-08-31', weekEnd: '2026-09-06', range: '8.31～9.6',
      markdown: 'md', items: [{ project: 'A' }], nextItems: [], aiGenerated: 'ai',
      updatedAt: '2026-09-06T00:00:00.000Z', versions: [{ id: 'v1' }], autoAI: true,
    };
    const row = reportToRow(U, rep);
    expect(row).not.toHaveProperty('versions');
    expect(row).not.toHaveProperty('autoAI');
    expect(reportFromRow(row, [])).toMatchObject({ id: 'p1', weekStart: '2026-08-31', markdown: 'md', aiGenerated: 'ai' });
  });

  it('extractVersionRows 把版本从报告里摊平', () => {
    const rows = extractVersionRows(U, [{ id: 'p1', versions: [{ id: 'v1', label: '手动保存' }, { id: 'v2' }] }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: U, report_id: 'p1', id: 'v1', label: '手动保存' });
  });
});

describe('settings 拆表与读回', () => {
  const settings = {
    projectStatuses: { 'OA 合同三期': '前期方案' },
    projectProfiles: { 'OA 合同三期': { statusNote: '方案推进暂缓', goal: '', background: '', milestonePlan: '' } },
    milestones: [{ id: 'm1', project: 'A', date: '2026-09-01', title: '上线', metric: '' }],
    issues: [{ id: 'i1', project: '二奢对账单', date: '2026-09-01', title: '并行对账', detail: 'd', resolution: '已反馈财务', resolvedDate: '' }],
  };

  it('阶段与当前状态写进 projects 的两列', () => {
    const { projects } = settingsToRows(U, settings);
    expect(projects[0]).toMatchObject({ name: 'OA 合同三期', progress: '前期方案', status_note: '方案推进暂缓' });
  });

  it('问题台账映射成行，空 resolvedDate 落成 null（date 列不接受空串）', () => {
    const { issues } = settingsToRows(U, settings);
    expect(issues[0]).toMatchObject({ id: 'i1', resolution: '已反馈财务', resolved_date: null });
  });

  it('整体往返一致', () => {
    const rows = settingsToRows(U, settings);
    const back = settingsFromRows({ projects: rows.projects, milestones: rows.milestones, issues: rows.issues });
    expect(back.projectStatuses).toEqual(settings.projectStatuses);
    expect(back.projectProfiles['OA 合同三期'].statusNote).toBe('方案推进暂缓');
    expect(back.issues[0]).toMatchObject({ id: 'i1', resolution: '已反馈财务', resolvedDate: '' });
  });

  it('只填了当前状态、档案其余为空的项目不会整条丢失', () => {
    const back = settingsFromRows({ projects: [{ name: 'X', progress: '', status_note: '只有现状', goal: '', background: '', milestone_plan: '' }] });
    expect(back.projectProfiles.X.statusNote).toBe('只有现状');
  });

  it('issues 传 null（表不存在）时整个键省略，合并不会清空本地台账', () => {
    const local = { issues: [{ id: 'local1', title: '本地刚建的' }] };
    const frag = settingsFromRows({ projects: [], milestones: [], issues: null });
    expect('issues' in frag).toBe(false);
    expect({ ...local, ...frag }.issues).toHaveLength(1);
  });

  it('表存在但为空时产出空数组，云端删干净能同步下来', () => {
    const local = { issues: [{ id: 'local1' }] };
    const frag = settingsFromRows({ projects: [], milestones: [], issues: [] });
    expect(frag.issues).toEqual([]);
    expect({ ...local, ...frag }.issues).toHaveLength(0);
  });
});

describe('差量计算', () => {
  it('diffRows 只挑出变更行与被删主键', () => {
    const prev = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const next = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }];
    const { upserts, deletes } = diffRows(prev, next);
    expect(upserts.map(r => r.id).sort()).toEqual(['b', 'c']); // a 未变不重传
    expect(deletes).toEqual([]);
    expect(diffRows(next, prev).deletes).toEqual(['c']);
  });

  it('自定义主键列（projects 按 name）', () => {
    const { deletes } = diffRows([{ name: 'A' }], [], 'name');
    expect(deletes).toEqual(['A']);
  });

  it('buildSyncPlan 覆盖 issues，且无变更时 isEmpty', () => {
    const settings = { issues: [{ id: 'i1', project: 'P', date: '2026-09-01', title: 't' }] };
    const empty = { workRecords: [], weeklyReports: [], settings: {} };
    const filled = { workRecords: [], weeklyReports: [], settings };

    const plan = buildSyncPlan(U, empty, filled);
    expect(plan.issues.upserts).toHaveLength(1);
    expect(plan.isEmpty).toBe(false);

    expect(buildSyncPlan(U, filled, filled).isEmpty).toBe(true);
    expect(buildSyncPlan(U, filled, empty).issues.deletes).toEqual(['i1']);
  });

  it('prev 为 null（首次同步）视为空，不炸', () => {
    const plan = buildSyncPlan(U, null, { workRecords: [{ id: 'r1', date: '2026-09-01', project: 'A', content: '', hours: 1 }], weeklyReports: [], settings: {} });
    expect(plan.workRecords.upserts).toHaveLength(1);
  });
});
