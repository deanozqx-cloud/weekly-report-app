import { useState } from 'react';
import { uid, today } from '../../lib/utils';
import Modal from '../ui/Modal';

export default function ProjectDetailModal({ project, workRecords, weeklyReports, startDate, endDate, settings, setSettings, onClose }) {
  const [tab, setTab] = useState('records');

  const records = workRecords
    .filter(r => r.project === project && r.date >= startDate && r.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const reports = weeklyReports
    .filter(r => (r.type || 'weekly') === 'weekly' && r.weekStart >= startDate && r.weekEnd <= endDate &&
      (r.items || []).some(it => it.project === project))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const totalHours = records.reduce((s, r) => s + r.hours, 0);

  // ── 项目档案 ──
  const profile = settings?.projectProfiles?.[project] || { goal: '', background: '', milestonePlan: '' };
  const [profileDraft, setProfileDraft] = useState(profile);
  const [profileSaved, setProfileSaved] = useState(false);
  const saveProfile = () => {
    setSettings(prev => ({
      ...prev,
      projectProfiles: { ...(prev.projectProfiles || {}), [project]: profileDraft },
    }));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // ── 里程碑 ──
  const milestones = (settings?.milestones || [])
    .filter(m => m.project === project)
    .sort((a, b) => b.date.localeCompare(a.date));
  const [msDraft, setMsDraft] = useState({ date: today(), title: '', metric: '' });
  const addMilestone = () => {
    if (!msDraft.title.trim()) { alert('请填写里程碑事件'); return; }
    const ms = { id: uid(), project, date: msDraft.date, title: msDraft.title.trim(), metric: msDraft.metric.trim() };
    setSettings(prev => ({ ...prev, milestones: [...(prev.milestones || []), ms] }));
    setMsDraft({ date: today(), title: '', metric: '' });
  };
  const removeMilestone = (id) => {
    setSettings(prev => ({ ...prev, milestones: (prev.milestones || []).filter(m => m.id !== id) }));
  };

  const tabs = [
    { key: 'records', label: `工作明细（${records.length}条）` },
    { key: 'reports', label: `周报记录（${reports.length}份）` },
    { key: 'profile', label: '项目档案' },
    { key: 'milestones', label: `里程碑（${milestones.length}）` },
  ];

  return (
    <Modal title={project} onClose={onClose} width="max-w-2xl">
      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm py-1.5 px-2 rounded-md font-medium transition-colors whitespace-nowrap ${tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <div>
          {totalHours > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              合计 <strong className="text-blue-600">{totalHours.toFixed(1)}h</strong> / <strong className="text-blue-600">{(totalHours/7.5).toFixed(1)}人天</strong>
            </p>
          )}
          <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-2">
            {records.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">暂无明细记录</p>
            ) : records.map(r => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-400 shrink-0 w-24">{r.date}</span>
                <span className="flex-1 text-gray-700">
                  {r.content}
                  {r.outcome && <span className="block text-xs text-emerald-600 mt-0.5">🏆 {r.outcome}</span>}
                </span>
                <span className="text-blue-600 font-medium shrink-0">{r.hours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无周报记录</p>
          ) : reports.map(r => {
            const item = (r.items || []).find(it => it.project === project);
            return (
              <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700">{r.weekStart.slice(0,4)}年 {r.range}周</span>
                  <span className="text-xs text-gray-400">{r.weekStart} ～ {r.weekEnd}</span>
                </div>
                {item && (
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div><span className="text-gray-400">工作内容：</span>{item.content}</div>
                    <div><span className="text-gray-400">项目进度：</span>{item.progress}</div>
                    {item.note && <div><span className="text-gray-400">备注：</span>{item.note}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'profile' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">项目档案用于月报/年报生成时评估进展是否达成目标，建议维护。</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">项目目标</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={2}
              placeholder="这个项目要达成什么，如：Q4 前上线 CRM 一期，覆盖全部销售团队"
              value={profileDraft.goal}
              onChange={e => setProfileDraft({ ...profileDraft, goal: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">背景说明</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={2}
              placeholder="为什么做这个项目（可选）"
              value={profileDraft.background}
              onChange={e => setProfileDraft({ ...profileDraft, background: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">里程碑计划</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={3}
              placeholder={'关键节点计划（可选），如：\n6月 完成需求评审\n8月 一期上线'}
              value={profileDraft.milestonePlan}
              onChange={e => setProfileDraft({ ...profileDraft, milestonePlan: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveProfile}
              className={`px-4 py-2 text-sm rounded-lg font-medium ${profileSaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {profileSaved ? '已保存 ✓' : '保存档案'}
            </button>
          </div>
        </div>
      )}

      {tab === 'milestones' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">记录已达成的关键成果（尽量带量化指标），月报/年报会完整引用。</p>
          {/* 添加表单 */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={msDraft.date}
                onChange={e => setMsDraft({ ...msDraft, date: e.target.value })}
              />
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
                placeholder="事件，如：CRM 一期上线"
                value={msDraft.title}
                onChange={e => setMsDraft({ ...msDraft, title: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
                placeholder="量化指标（可选），如：覆盖 300 名销售，日活 85%"
                value={msDraft.metric}
                onChange={e => setMsDraft({ ...msDraft, metric: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addMilestone(); }}
              />
              <button onClick={addMilestone} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0">添加</button>
            </div>
          </div>
          {/* 列表 */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin space-y-2">
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">暂无里程碑记录</p>
            ) : milestones.map(m => (
              <div key={m.id} className="group flex items-start gap-3 px-3 py-2.5 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-400 shrink-0 w-24">{m.date}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-700 font-medium">🏆 {m.title}</div>
                  {m.metric && <div className="text-xs text-emerald-600 mt-0.5">{m.metric}</div>}
                </div>
                <button
                  onClick={() => removeMilestone(m.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 transition-opacity"
                >&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
