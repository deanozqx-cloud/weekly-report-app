import { today } from './utils';

const TYPE_LABEL = { weekly: '周报', monthly: '月报', quarterly: '季报', half: '半年报', annual: '年报' };

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 备份用的 settings：抹掉 API Key，避免备份文件外泄导致密钥泄露
function sanitizeSettings(settings = {}) {
  const providers = (settings.llm?.providers || []).map(p => ({ ...p, apiKey: '' }));
  return { ...settings, llm: { ...(settings.llm || {}), providers } };
}

// 完整备份（JSON）：工作记录 + 全部报告（含版本历史）+ 项目档案/里程碑/写作规则/报告范文
export function exportJson(workRecords, weeklyReports, settings) {
  const payload = {
    app: 'weekly-report-app',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    note: '出于安全考虑，导出内容不含各 LLM 的 API Key，恢复后需重新填写。',
    workRecords,
    reports: weeklyReports,
    settings: sanitizeSettings(settings),
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `周报助手备份-${today()}.json`,
  );
}

// 表格备份（Excel）：便于人工查阅与二次加工，不含版本历史
export async function exportExcel(workRecords, weeklyReports, settings) {
  const XLSX = await import('xlsx'); // 体积大，按需加载
  const wb = XLSX.utils.book_new();

  const records = [...workRecords].sort((a, b) => a.date.localeCompare(b.date));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    records.map(r => ({
      日期: r.date, 项目: r.project || '', 工作内容: r.content || '',
      成果产出: r.outcome || '', 工时: r.hours ?? 0,
    })),
  ), '工作记录');

  const reports = [...weeklyReports].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    reports.map(r => ({
      类型: TYPE_LABEL[r.type || 'weekly'] || r.type,
      周期: r.range || '', 开始日期: r.weekStart, 结束日期: r.weekEnd,
      内容: r.markdown || '', 更新时间: r.updatedAt || '',
    })),
  ), '报告');

  const statuses = settings?.projectStatuses || {};
  const profiles = settings?.projectProfiles || {};
  const names = [...new Set([
    ...Object.keys(statuses), ...Object.keys(profiles),
    ...records.map(r => r.project).filter(Boolean),
  ])].sort();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    names.map(n => ({
      项目: n, 项目进度: statuses[n] || '',
      目标: profiles[n]?.goal || '', 背景: profiles[n]?.background || '',
      里程碑计划: profiles[n]?.milestonePlan || '',
    })),
  ), '项目');

  const milestones = [...(settings?.milestones || [])].sort((a, b) => a.date.localeCompare(b.date));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    milestones.map(m => ({ 日期: m.date, 项目: m.project || '', 事件: m.title || '', 量化指标: m.metric || '' })),
  ), '里程碑');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `周报助手数据-${today()}.xlsx`,
  );
}
