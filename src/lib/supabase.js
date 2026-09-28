import { createClient } from '@supabase/supabase-js';
import {
  recordFromRow, reportFromRow, versionFromRow,
  settingsFromRows, settingsToRows,
  recordToRow, reportToRow, extractVersionRows,
  buildSyncPlan,
} from './sync';

const SUPABASE_URL      = 'https://qjzzmaqwudawizwkxipc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqenptYXF3dWRhd2l6d2t4aXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjE0NDAsImV4cCI6MjA5NDE5NzQ0MH0.PaKTRzXNsRQFFgGGDoQd-hnDblSHD1gtey6GmoIN--Y';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const throwIf = (error) => { if (error) throw new Error(error.message); };

// 表不存在（42P01）或 PostgREST 架构缓存里没有该列（PGRST204）：都是「schema.sql 没执行」
const isSchemaStale = (error) => !!error && (
  error.code === '42P01' || error.code === 'PGRST204' ||
  /does not exist|schema cache/i.test(error.message || '')
);
const SCHEMA_STALE_HINT = '数据库结构需要升级：请在 Supabase 控制台 → SQL Editor 中整段执行仓库里的 supabase/schema.sql（幂等，可重复执行），然后重试。';
const throwIfWithHint = (error) => {
  if (!error) return;
  throw new Error(isSchemaStale(error) ? `${SCHEMA_STALE_HINT}（原始错误：${error.message}）` : error.message);
};
const chunk = (arr, n = 400) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// 调用服务端邮件函数发信（SMTP 凭据只在 Edge Function 的环境变量里）
export async function sbSendMail({ to, cc, subject, html, text, mode }) {
  const { data, error } = await sb.functions.invoke('send-mail', {
    body: { to, cc, subject, html, text, mode },
  });
  if (error) {
    // functions.invoke 把非 2xx 包成 FunctionsHttpError，真正的原因在响应体里
    let msg = error.message || '发送失败';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = [body.error, body.detail, body.hint].filter(Boolean).join('：');
    } catch { /* 响应体不可解析时用原始 message */ }
    if (/Failed to send a request|Function not found|404/i.test(msg)) {
      msg = '未找到 send-mail 函数：请先在 Supabase 部署 Edge Function（见仓库 supabase/functions/send-mail）';
    }
    throw new Error(msg);
  }
  return data;
}

export async function sbUserId() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('未登录');
  return user.id;
}

// ── 新表结构是否已建（未建时应用回退旧 user_data 模式） ──
export async function sbSchemaOk() {
  const { error } = await sb.from('user_settings').select('user_id').limit(1);
  if (!error) return true;
  if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return false;
  throw new Error(error.message);
}

// ═══ 旧模式（user_data 单行 JSONB）：迁移数据源 + 未建表时的回退路径 ═══
export async function sbLoadLegacy() {
  const { data, error } = await sb.from('user_data').select('*').maybeSingle();
  if (error) {
    // 旧表也不存在（全新项目直接建了新表）视为无旧数据
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return { workRecords: [], weeklyReports: [], settings: null };
    throw new Error(error.message);
  }
  if (!data) return { workRecords: [], weeklyReports: [], settings: null };
  return {
    workRecords:   data.work_records   || [],
    weeklyReports: data.weekly_reports || [],
    settings:      data.settings       || null,
  };
}

export async function sbSaveLegacy(workRecords, weeklyReports, settings) {
  const userId = await sbUserId();
  const { error } = await sb.from('user_data').upsert(
    { user_id: userId, work_records: workRecords, weekly_reports: weeklyReports, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  throwIf(error);
  if (settings) {
    // 静默容错：旧结构可能没有 settings 列（supabase 错误走 resolve，这里显式 await 并忽略结果即可）
    await sb.from('user_data').upsert(
      { user_id: userId, settings },
      { onConflict: 'user_id' }
    );
  }
}

// ═══ 新模式：分表读写 ═══

// 全量加载并组装为应用内结构
export async function sbLoadAll() {
  const [wr, rp, rv, pj, ms, iss, us] = await Promise.all([
    sb.from('work_records').select('*').order('date', { ascending: false }),
    sb.from('reports').select('*').order('period_start', { ascending: false }),
    sb.from('report_versions').select('*').order('saved_at', { ascending: true }),
    sb.from('projects').select('*'),
    sb.from('milestones').select('*'),
    sb.from('issues').select('*').order('date', { ascending: false }),
    sb.from('user_settings').select('*').maybeSingle(),
  ]);
  [wr, rp, rv, pj, ms, us].forEach(res => throwIf(res.error));
  // issues 是后加的表：尚未执行新版 schema.sql 时降级为空，其余功能照常可用
  if (iss.error && !isSchemaStale(iss.error)) throwIf(iss.error);
  // 缺表时传 null（而非空数组）：合并时整个键省略，本地台账不被清空
  const issueRows = iss.error ? null : (iss.data || []);

  const versionsByReport = {};
  (rv.data || []).forEach(row => {
    (versionsByReport[row.report_id] = versionsByReport[row.report_id] || []).push(versionFromRow(row));
  });

  const workRecords = (wr.data || []).map(recordFromRow);
  const weeklyReports = (rp.data || []).map(row => reportFromRow(row, versionsByReport[row.id] || []));
  const settingsFragment = settingsFromRows({
    projects: pj.data || [],
    milestones: ms.data || [],
    issues: issueRows,
    userSettings: us.data || null,
  });
  const empty = !workRecords.length && !weeklyReports.length && !(pj.data || []).length
    && !(ms.data || []).length && !(issueRows || []).length && !us.data;
  return { workRecords, weeklyReports, settingsFragment, empty };
}

// 首次使用新表时：把旧 user_data 数据整体写入分表（幂等 upsert；user_data 保留作备份）
export async function sbMigrateLegacy(legacy) {
  const userId = await sbUserId();
  const reports = legacy.weeklyReports || [];
  const settings = legacy.settings || {};
  const { projects, milestones, issues, userSettings } = settingsToRows(userId, settings);

  const tables = [
    ['work_records',    (legacy.workRecords || []).map(r => recordToRow(userId, r))],
    ['reports',         reports.map(r => reportToRow(userId, r))],
    ['report_versions', extractVersionRows(userId, reports)],
    ['projects',        projects],
    ['milestones',      milestones],
    ['issues',          issues],
    ['user_settings',   [userSettings]],
  ];
  for (const [table, rows] of tables) {
    for (const c of chunk(rows)) {
      const { error } = await sb.from(table).upsert(c);
      throwIfWithHint(error);
    }
  }
}

// 差量同步：只写变更行、删被移除的行
export async function sbSyncDiff(prev, next) {
  const userId = await sbUserId();
  const plan = buildSyncPlan(userId, prev, next);
  if (plan.isEmpty) return;

  const applyDiff = async (table, diff, keyCol = 'id') => {
    for (const c of chunk(diff.upserts)) {
      const { error } = await sb.from(table).upsert(c);
      throwIfWithHint(error);
    }
    if (diff.deletes.length) {
      for (const c of chunk(diff.deletes)) {
        const { error } = await sb.from(table).delete().eq('user_id', userId).in(keyCol, c);
        throwIfWithHint(error);
      }
    }
  };

  await applyDiff('work_records', plan.workRecords);
  await applyDiff('reports', plan.reports);
  await applyDiff('report_versions', plan.versions);
  await applyDiff('projects', plan.projects, 'name');
  await applyDiff('milestones', plan.milestones);
  await applyDiff('issues', plan.issues);
  if (plan.userSettings) {
    const { error } = await sb.from('user_settings').upsert({ ...plan.userSettings, updated_at: new Date().toISOString() });
    throwIfWithHint(error);
  }
}
