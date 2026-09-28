import { useState } from 'react';
import { uid, today } from '../../lib/utils';
import Modal from '../ui/Modal';

export default function ProjectDetailModal({ project, workRecords, weeklyReports, startDate, endDate, settings, setSettings, onClose }) {
  const [tab, setTab] = useState('records');

  const records = workRecords
    .filter(r => r.project === project && r.date >= startDate && r.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 与汇总页计数同口径：与日期区间交叠即计入（跨区间边界的周报不漏）
  const reports = weeklyReports
    .filter(r => (r.type || 'weekly') === 'weekly' && r.weekStart <= endDate && r.weekEnd >= startDate &&
      (r.items || []).some(it => it.project === project))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const totalHours = records.reduce((s, r) => s + r.hours, 0);

  // ── 项目档案 ──
  const profile = settings?.projectProfiles?.[project] || { statusNote: '', goal: '', background: '', milestonePlan: '' };
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
    if (!msDraft.date) { alert('请选择日期'); return; }
    if (!msDraft.title.trim()) { alert('请填写里程碑事件'); return; }
    const ms = { id: uid(), project, date: msDraft.date, title: msDraft.title.trim(), metric: msDraft.metric.trim() };
    setSettings(prev => ({ ...prev, milestones: [...(prev.milestones || []), ms] }));
    setMsDraft({ date: today(), title: '', metric: '' });
  };
  const removeMilestone = (id) => {
    setSettings(prev => ({ ...prev, milestones: (prev.milestones || []).filter(m => m.id !== id) }));
  };

  // ── 问题台账 ──
  const issues = (settings?.issues || [])
    .filter(i => i.project === project)
    // 跟进中的排前面，其次按日期倒序
    .sort((a, b) => (Number(!!a.resolvedDate) - Number(!!b.resolvedDate)) || String(b.date).localeCompare(String(a.date)));
  const openIssueCount = issues.filter(i => !i.resolvedDate).length;
  const [issueDraft, setIssueDraft] = useState({ date: today(), title: '', detail: '' });
  const addIssue = () => {
    if (!issueDraft.date) { alert('请选择日期'); return; }
    if (!issueDraft.title.trim()) { alert('请填写问题'); return; }
    const item = {
      id: uid(), project, date: issueDraft.date,
      title: issueDraft.title.trim(), detail: issueDraft.detail.trim(),
      resolution: '', resolvedDate: '',
    };
    setSettings(prev => ({ ...prev, issues: [...(prev.issues || []), item] }));
    setIssueDraft({ date: today(), title: '', detail: '' });
  };
  const updateIssue = (id, patch) => {
    setSettings(prev => ({ ...prev, issues: (prev.issues || []).map(i => (i.id === id ? { ...i, ...patch } : i)) }));
  };
  const removeIssue = (id) => {
    setSettings(prev => ({ ...prev, issues: (prev.issues || []).filter(i => i.id !== id) }));
  };

  const tabs = [
    { key: 'records', label: `工作明细（${records.length}条）` },
    { key: 'reports', label: `周报记录（${reports.length}份）` },
    { key: 'profile', label: '项目档案' },
    { key: 'milestones', label: `里程碑（${milestones.length}）` },
    { key: 'issues', label: `问题（${openIssueCount}）` },
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
            <label className="block text-sm font-medium text-gray-700 mb-1">当前状态</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={2}
              placeholder="一句话说清项目此刻处在什么位置，如：已完成 PRD 并移交开发，一期优化迭代进行中"
              value={profileDraft.statusNote || ''}
              onChange={e => setProfileDraft({ ...profileDraft, statusNote: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">
              报告总览表的「当前状态」列会<strong className="text-gray-500">原样采用</strong>这句话。本周没有工作记录的项目尤其需要维护，否则 AI 只能靠猜。也可在汇总页表格里直接改。
            </p>
          </div>
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
      {tab === 'issues' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            跨周持续跟进的问题。「应对进展」每周更新一次，报告的「问题与反馈」章节会<strong className="text-gray-500">原样采用</strong>，不会被 AI 改写。标记解决后当周报告仍会带一句收口，之后不再出现。
          </p>
          {/* 添加表单 */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={issueDraft.date}
                onChange={e => setIssueDraft({ ...issueDraft, date: e.target.value })}
              />
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
                placeholder="问题，如：线上线下两套对账流程并行，数据偏差需开发排查"
                value={issueDraft.title}
                onChange={e => setIssueDraft({ ...issueDraft, title: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
                placeholder="补充说明（可选），如：快递公司催账急，垫资风险下仍需每周线下对账"
                value={issueDraft.detail}
                onChange={e => setIssueDraft({ ...issueDraft, detail: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addIssue(); }}
              />
              <button onClick={addIssue} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0">添加</button>
            </div>
          </div>
          {/* 列表 */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin space-y-2">
            {issues.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">暂无问题记录</p>
            ) : issues.map(i => (
              <div key={i.id} className="group px-3 py-2.5 bg-gray-50 rounded-lg text-sm space-y-1.5">
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 shrink-0 w-24">{i.date}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${i.resolvedDate ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {i.resolvedDate ? '\u2705' : '\u26a0\ufe0f'} {i.title}
                    </div>
                    {i.detail && <div className="text-xs text-gray-500 mt-0.5">{i.detail}</div>}
                    {i.resolvedDate && <div className="text-xs text-gray-400 mt-0.5">{i.resolvedDate} 已解决</div>}
                  </div>
                  <button
                    onClick={() => updateIssue(i.id, { resolvedDate: i.resolvedDate ? '' : today() })}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 shrink-0 whitespace-nowrap transition-opacity"
                  >{i.resolvedDate ? '重新打开' : '标记解决'}</button>
                  <button
                    onClick={() => removeIssue(i.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 transition-opacity"
                  >&times;</button>
                </div>
                <input
                  key={`${i.id}:${i.resolution}`}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="应对进展（每周更新，会原样写进报告）"
                  defaultValue={i.resolution || ''}
                  onBlur={e => updateIssue(i.id, { resolution: e.target.value.trim() })}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
