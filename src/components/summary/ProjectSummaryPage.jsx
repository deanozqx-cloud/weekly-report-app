import { useState, useMemo } from 'react';
import { DEFAULT_PROGRESS_OPTIONS } from '../../lib/constants';
import { today } from '../../lib/utils';
import EditableSelect from '../ui/EditableSelect';
import SearchableProjectSelect from '../ui/SearchableProjectSelect';
import ProjectDetailModal from './ProjectDetailModal';

export default function ProjectSummaryPage({ workRecords, setWorkRecords, weeklyReports = [], settings, setSettings }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(today());
  const [selectedProject, setSelectedProject] = useState(null);
  const [filterProject, setFilterProject] = useState('');
  const [filterProgress, setFilterProgress] = useState('');
  const [checkedProjects, setCheckedProjects] = useState(new Set());
  const [batchProgress, setBatchProgress] = useState('');
  // 行内编辑项目名：{ project, draft } | null
  const [editing, setEditing] = useState(null);

  const projectStatuses = settings?.projectStatuses || {};
  const projectProfiles = settings?.projectProfiles || {};
  // 与周报共用同一套进度选项；历史自定义的 statusOptions 合并进来，不丢用户数据
  const progressOptions = useMemo(() => [...new Set([
    ...(settings?.progressOptions || DEFAULT_PROGRESS_OPTIONS),
    ...(settings?.statusOptions || []),
  ])], [settings?.progressOptions, settings?.statusOptions]);

  const setProjectProgress = (project, progress) => {
    setSettings(prev => ({ ...prev, projectStatuses: { ...(prev.projectStatuses || {}), [project]: progress } }));
  };
  const addProgressOption = v => {
    setSettings(prev => ({ ...prev, progressOptions: [...(prev.progressOptions || DEFAULT_PROGRESS_OPTIONS), v] }));
  };

  const allStats = useMemo(() => {
    const filtered = workRecords.filter(r => r.date >= startDate && r.date <= endDate);
    const byProject = {};
    filtered.forEach(r => {
      if (!byProject[r.project]) byProject[r.project] = { hours: 0, count: 0, dates: new Set() };
      byProject[r.project].hours += r.hours;
      byProject[r.project].count += 1;
      byProject[r.project].dates.add(r.date);
    });
    return Object.entries(byProject)
      .map(([project, d]) => ({ project, hours: d.hours, personDays: (d.hours / 7.5).toFixed(1), days: d.dates.size, recordCount: d.count }))
      .sort((a, b) => b.hours - a.hours);
  }, [workRecords, startDate, endDate]);

  // 各项目在日期范围内出现的周报份数（交叠即计入，跨区间边界的周报不漏；口径与详情弹窗一致）
  const reportCounts = useMemo(() => {
    const map = {};
    weeklyReports.forEach(r => {
      if ((r.type || 'weekly') !== 'weekly') return;
      if (!(r.weekStart <= endDate && r.weekEnd >= startDate)) return;
      new Set((r.items || []).map(it => it.project).filter(Boolean)).forEach(p => {
        map[p] = (map[p] || 0) + 1;
      });
    });
    return map;
  }, [weeklyReports, startDate, endDate]);

  const stats = allStats.filter(s =>
    (!filterProject || s.project === filterProject) &&
    (!filterProgress || (projectStatuses[s.project] || '') === filterProgress)
  );
  const allProjects = useMemo(() => allStats.map(s => s.project), [allStats]);
  const totalHours = stats.reduce((s, r) => s + r.hours, 0);
  const totalRecords = stats.reduce((s, r) => s + r.recordCount, 0);

  const toggleCheck = (project, e) => {
    e.stopPropagation();
    setCheckedProjects(prev => {
      const next = new Set(prev);
      next.has(project) ? next.delete(project) : next.add(project);
      return next;
    });
  };
  const allChecked = stats.length > 0 && stats.every(s => checkedProjects.has(s.project));
  const toggleAll = () => {
    if (allChecked) {
      setCheckedProjects(prev => { const next = new Set(prev); stats.forEach(s => next.delete(s.project)); return next; });
    } else {
      setCheckedProjects(prev => { const next = new Set(prev); stats.forEach(s => next.add(s.project)); return next; });
    }
  };
  const checkedInView = stats.filter(s => checkedProjects.has(s.project));

  const applyBatchProgress = () => {
    if (!batchProgress) return;
    const updated = { ...projectStatuses };
    checkedInView.forEach(s => { updated[s.project] = batchProgress; });
    setSettings({ ...settings, projectStatuses: updated });
    setCheckedProjects(new Set());
    setBatchProgress('');
  };

  // 重命名项目（行内编辑提交）：同步更新全部工作记录、进度、档案、里程碑；历史周报是快照，保持原文不动
  const commitRename = () => {
    if (!editing) return;
    const oldName = editing.project;
    const newName = editing.draft.trim();
    setEditing(null);
    if (!newName || newName === oldName) return;
    const count = workRecords.filter(r => r.project === oldName).length;
    const exists = workRecords.some(r => r.project === newName);
    const msg = exists
      ? `项目「${newName}」已存在，「${oldName}」的 ${count} 条工作记录将并入该项目。确定合并？`
      : `将把「${oldName}」的 ${count} 条工作记录改名为「${newName}」。已生成的历史周报保持原文不变。确定？`;
    if (!window.confirm(msg)) return;
    setWorkRecords(prev => prev.map(r => r.project === oldName ? { ...r, project: newName } : r));
    setSettings(prev => {
      const statuses = { ...(prev.projectStatuses || {}) };
      if (statuses[oldName] != null && statuses[newName] == null) statuses[newName] = statuses[oldName];
      delete statuses[oldName];
      const profiles = { ...(prev.projectProfiles || {}) };
      if (profiles[oldName] != null && profiles[newName] == null) profiles[newName] = profiles[oldName];
      delete profiles[oldName];
      const milestones = (prev.milestones || []).map(m => m.project === oldName ? { ...m, project: newName } : m);
      return { ...prev, projectStatuses: statuses, projectProfiles: profiles, milestones };
    });
    setCheckedProjects(prev => { const next = new Set(prev); next.delete(oldName); return next; });
    if (filterProject === oldName) setFilterProject('');
    if (selectedProject === oldName) setSelectedProject(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
      {/* 顶栏 */}
      <div className="p-5 border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-semibold text-gray-800">项目工时汇总</h2>
          <div className="flex items-center gap-2">
            <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span className="text-gray-400">至</span>
            <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <SearchableProjectSelect projects={allProjects} value={filterProject} onChange={setFilterProject} placeholder="筛选项目…" className="w-52" />
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={filterProgress} onChange={e => setFilterProgress(e.target.value)}>
            <option value="">全部进度</option>
            {progressOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* 批量操作栏 */}
      {checkedInView.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-blue-50 border-b border-blue-100">
          <span className="text-sm text-blue-700 font-medium">已选 {checkedInView.length} 个项目</span>
          <select
            className="border border-blue-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={batchProgress}
            onChange={e => setBatchProgress(e.target.value)}
          >
            <option value="">选择进度…</option>
            {progressOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button
            onClick={applyBatchProgress}
            disabled={!batchProgress}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >应用</button>
          <button
            onClick={() => { setCheckedProjects(new Set()); setBatchProgress(''); }}
            className="ml-auto text-sm text-blue-500 hover:text-blue-700"
          >取消选择</button>
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-300">
            <p className="text-sm">所选时间范围内暂无记录</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded cursor-pointer"
                  />
                </th>
                <th className="w-8 py-3 text-center text-gray-400">#</th>
                <th className="px-3 py-3 text-left font-medium">项目</th>
                <th className="px-2 py-3 text-right font-medium whitespace-nowrap">明细</th>
                <th className="px-2 py-3 text-right font-medium whitespace-nowrap">周报</th>
                <th className="px-3 py-3 text-left font-medium">项目档案</th>
                <th className="px-3 py-3 text-right font-medium">工时</th>
                <th className="px-3 py-3 text-right font-medium">人天</th>
                <th className="px-4 py-3 text-left font-medium w-36">项目进度</th>
              </tr>
              {/* 合计行：紧跟标题行 */}
              <tr className="bg-blue-50 border-b border-blue-100 text-xs font-medium text-blue-700">
                <td></td>
                <td></td>
                <td className="px-3 py-2.5">合计（{stats.length} 个项目）</td>
                <td className="px-2 py-2.5 text-right">{totalRecords}条</td>
                <td></td>
                <td></td>
                <td className="px-3 py-2.5 text-right font-bold">{totalHours.toFixed(1)}h</td>
                <td className="px-3 py-2.5 text-right font-bold">{(totalHours/7.5).toFixed(1)}天</td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const isChecked = checkedProjects.has(s.project);
                const isEditing = editing?.project === s.project;
                const goal = projectProfiles[s.project]?.goal || '';
                return (
                  <tr
                    key={s.project}
                    onClick={() => { if (!isEditing) setSelectedProject(s.project); }}
                    className={`group border-b border-gray-50 cursor-pointer transition-colors ${isChecked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 text-center" onClick={e => toggleCheck(s.project, e)}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3 text-center text-xs text-gray-400">{allStats.indexOf(s) + 1}</td>
                    <td className="px-3 py-3 font-medium text-gray-800 max-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            className="flex-1 min-w-0 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editing.draft}
                            onChange={e => setEditing({ ...editing, draft: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <button onClick={commitRename} className="shrink-0 p-1 text-green-600 hover:bg-green-50 rounded" title="确认（Enter）">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button onClick={() => setEditing(null)} className="shrink-0 p-1 text-gray-400 hover:bg-gray-100 rounded" title="取消（Esc）">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{s.project}</span>
                          <button
                            onClick={e => { e.stopPropagation(); setEditing({ project: s.project, draft: s.project }); }}
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-opacity"
                            title="编辑项目名称"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-500 whitespace-nowrap">{s.recordCount}条</td>
                    <td className="px-2 py-3 text-right text-gray-500 whitespace-nowrap">{reportCounts[s.project] || 0}份</td>
                    <td className="px-3 py-3 max-w-0">
                      {goal ? (
                        <span className="block truncate text-xs text-gray-500" title={goal}>{goal}</span>
                      ) : (
                        <span className="text-xs text-gray-300">未维护</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-600 font-medium whitespace-nowrap">{s.hours.toFixed(1)}h</td>
                    <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">{s.personDays}天</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <EditableSelect
                        value={projectStatuses[s.project] || ''}
                        options={progressOptions}
                        onChange={v => setProjectProgress(s.project, v)}
                        onAddOption={addProgressOption}
                        placeholder="设置进度"
                        className="w-28"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          workRecords={workRecords}
          weeklyReports={weeklyReports}
          startDate={startDate}
          endDate={endDate}
          settings={settings}
          setSettings={setSettings}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </div>
  );
}
