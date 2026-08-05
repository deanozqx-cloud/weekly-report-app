import { useState } from 'react';
import { uid } from '../../lib/utils';
import { generateReportFromRecords } from '../../lib/markdown';
import { generateLongReportTemplate, LONG_TYPES } from '../../lib/prompts';
import { useIsMobile } from '../../lib/hooks';
import ReportEditor from './ReportEditor';
import WeekPickerModal from './WeekPickerModal';
import PeriodPickerModal from './PeriodPickerModal';
import ImportModal from './ImportModal';

export default function WeeklyReportPage({ workRecords, setWorkRecords, weeklyReports, setWeeklyReports, settings, setSettings }) {
  const [selectedId, setSelectedId] = useState(weeklyReports[0]?.id || null);
  const [showPicker, setShowPicker] = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [typeTab, setTypeTab] = useState('weekly'); // 'weekly' | 'monthly' | 'quarterly' | 'half' | 'annual'
  const [mobileTab, setMobileTab] = useState('list');
  const isMobile = useIsMobile();

  const selectedReport = weeklyReports.find(r => r.id === selectedId);
  const visibleReports = weeklyReports.filter(r => (r.type || 'weekly') === typeTab);

  const switchTab = (tab) => {
    setTypeTab(tab);
    const first = weeklyReports
      .filter(r => (r.type || 'weekly') === tab)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
    setSelectedId(first?.id || null);
  };

  const handleConfirmGenerate = (weekStart, weekEnd, isEmpty, aiProvider) => {
    if (isEmpty && !window.confirm('该时段没有工作记录，是否仍要生成空白周报？')) return;
    setShowPicker(false);

    const records = workRecords.filter(r => r.date >= weekStart && r.date <= weekEnd);
    const existing = weeklyReports.find(r => (r.type || 'weekly') === 'weekly' && r.weekStart === weekStart && r.weekEnd === weekEnd);

    const generated = generateReportFromRecords(weekStart, records, weekEnd, settings?.projectStatuses);
    const newReport = { id: uid(), ...generated, weekEnd, autoAI: true, autoAIProvider: aiProvider || '', generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

    let newReports;
    if (existing) {
      // 覆盖时保留版本历史，并把被覆盖的旧内容存为快照
      newReports = weeklyReports.map(r => {
        if (!((r.type || 'weekly') === 'weekly' && r.weekStart === weekStart && r.weekEnd === weekEnd)) return r;
        const snap = { id: uid(), savedAt: new Date().toISOString(), label: '覆盖前', markdown: r.markdown || '', items: r.items || [], nextItems: r.nextItems || [] };
        const versions = [...(r.versions || []), snap].slice(-20);
        return { ...newReport, id: r.id, versions };
      });
    } else {
      newReports = [newReport, ...weeklyReports].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    }
    setWeeklyReports(newReports);
    setSelectedId(existing ? existing.id : newReport.id);
  };

  // 生成长周期报告（月/季/半年/年）：分层汇总（编辑器内 autoAI 触发 AI 生成，先落一个模板兜底）
  const handleConfirmGenerateLong = (type, start, end, label, aiProvider) => {
    setShowPeriodPicker(false);
    const records = workRecords.filter(r => r.date >= start && r.date <= end);
    const periodMilestones = (settings?.milestones || []).filter(x => x.date >= start && x.date <= end);
    const template = generateLongReportTemplate({ type, label, records, milestones: periodMilestones });
    const existing = weeklyReports.find(r => r.type === type && r.weekStart === start && r.weekEnd === end);
    const newReport = {
      id: uid(), type, weekStart: start, weekEnd: end, range: label,
      items: [], nextItems: [], markdown: template,
      autoAI: true, autoAIProvider: aiProvider || '',
      generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    let newReports;
    if (existing) {
      // 覆盖时保留版本历史，并把被覆盖的旧内容存为快照
      newReports = weeklyReports.map(r => {
        if (r.id !== existing.id) return r;
        const snap = { id: uid(), savedAt: new Date().toISOString(), label: '覆盖前', markdown: r.markdown || '', items: r.items || [], nextItems: r.nextItems || [] };
        const versions = [...(r.versions || []), snap].slice(-20);
        return { ...newReport, id: r.id, versions };
      });
    } else {
      newReports = [newReport, ...weeklyReports].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    }
    setWeeklyReports(newReports);
    setSelectedId(existing ? existing.id : newReport.id);
    setTypeTab(type);
    if (isMobile) setMobileTab('editor');
  };

  const handleSaveReport = (updated) => {
    // 函数式更新：AI 生成流程会在 await 前后各保存一次，不能 map 渲染期快照
    setWeeklyReports(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleDeleteReport = (id) => {
    if (!window.confirm('确定删除这份周报？')) return;
    const newReports = weeklyReports.filter(r => r.id !== id);
    setWeeklyReports(newReports);
    setSelectedId(newReports[0]?.id || null);
  };

  const handleImport = (weeks, conflict) => {
    const existingWeekEnds = new Set(weeklyReports.filter(r => (r.type || 'weekly') === 'weekly').map(r => r.weekEnd));
    const newWorkRecords = [...workRecords];
    let newReports = [...weeklyReports];

    weeks.forEach(w => {
      const isConflict = existingWeekEnds.has(w.weekEnd);
      if (isConflict && conflict === 'skip') return;

      if (isConflict && conflict === 'overwrite') {
        const toRemove = new Set(workRecords.filter(r => r.date >= w.weekStart && r.date <= w.weekEnd).map(r => r.id));
        newWorkRecords.splice(0, newWorkRecords.length, ...newWorkRecords.filter(r => !toRemove.has(r.id)));
      }
      w.records.forEach(rec => {
        newWorkRecords.push({ id: uid(), date: rec.date, project: rec.project, content: rec.content, hours: rec.hours, createdAt: new Date().toISOString() });
      });

      const generated = generateReportFromRecords(w.weekStart, w.records, w.weekEnd, settings?.projectStatuses);
      const newReport = { id: uid(), ...generated, weekEnd: w.weekEnd, generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (isConflict && conflict === 'overwrite') {
        // 覆盖时保留版本历史，并把被覆盖的旧内容存为快照
        newReports = newReports.map(r => {
          if ((r.type || 'weekly') !== 'weekly' || r.weekEnd !== w.weekEnd) return r;
          const snap = { id: uid(), savedAt: new Date().toISOString(), label: '覆盖前', markdown: r.markdown || '', items: r.items || [], nextItems: r.nextItems || [] };
          const versions = [...(r.versions || []), snap].slice(-20);
          return { ...newReport, id: r.id, versions };
        });
      } else {
        newReports.push(newReport);
      }
    });

    newReports.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    setWorkRecords(newWorkRecords);
    setWeeklyReports(newReports);
    setShowImport(false);
    setSelectedId(newReports[0]?.id || null);
  };

  const reportList = (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col ${isMobile ? 'h-full' : ''}`} style={isMobile ? {} : {width:'220px',flexShrink:0}}>
      <div className="p-4 border-b border-gray-100 space-y-2">
        {/* 报告类型切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[
            { key: 'weekly', label: '周' },
            { key: 'monthly', label: '月' },
            { key: 'quarterly', label: '季' },
            { key: 'half', label: '半年' },
            { key: 'annual', label: '年' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`flex-1 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${typeTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >{t.label}</button>
          ))}
        </div>
        {typeTab === 'weekly' ? (
          <>
            <button
              onClick={() => setShowPicker(true)}
              className="w-full bg-blue-600 text-white text-sm py-2.5 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              生成周报
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="w-full border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50 font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              导入历史数据
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowPeriodPicker(true)}
            className="w-full bg-blue-600 text-white text-sm py-2.5 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            生成{LONG_TYPES[typeTab]?.name || '报告'}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {visibleReports.length === 0 ? (
          <div className="text-center text-gray-300 text-sm py-8 px-3">
            <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p>点击上方按钮<br/>生成第一份{typeTab === 'weekly' ? '周报' : (LONG_TYPES[typeTab]?.name || '报告')}</p>
          </div>
        ) : [...visibleReports].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map(r => (
          <div
            key={r.id}
            className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer mb-1 ${selectedId === r.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
            onClick={() => { setSelectedId(r.id); if (isMobile) setMobileTab('editor'); }}
          >
            <div className="min-w-0">
              <div className={`text-sm font-medium truncate ${selectedId === r.id ? 'text-blue-700' : 'text-gray-700'}`}>{r.range}</div>
              <div className="text-xs text-gray-400">{(r.type || 'weekly') === 'weekly' ? `${r.weekStart.slice(0,4)}年` : (LONG_TYPES[r.type]?.name || '')}</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteReport(r.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-lg leading-none transition-opacity ml-1 shrink-0"
            >&times;</button>
          </div>
        ))}
      </div>
    </div>
  );

  const reportEditor = (
    <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      {isMobile && (
        <button onClick={() => setMobileTab('list')} className="flex items-center gap-1.5 px-4 py-3 text-sm text-gray-500 hover:text-gray-700 border-b border-gray-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>
      )}
      {selectedReport ? (
        <ReportEditor report={selectedReport} onSave={handleSaveReport} settings={settings} setSettings={setSettings} weeklyReports={weeklyReports} workRecords={workRecords} setWorkRecords={setWorkRecords} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-gray-300">
          <svg className="w-16 h-16 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">选择周报或点击「生成周报」</p>
        </div>
      )}
    </div>
  );

  return (
    <div className={`${isMobile ? 'flex flex-col' : 'flex'} gap-4 h-full`}>
      {isMobile ? (
        mobileTab === 'list' ? reportList : reportEditor
      ) : (
        <>
          {reportList}
          {reportEditor}
        </>
      )}

      {showPicker && (
        <WeekPickerModal
          onConfirm={handleConfirmGenerate}
          onClose={() => setShowPicker(false)}
          workRecords={workRecords}
          weeklyReports={weeklyReports}
          settings={settings}
        />
      )}
      {showPeriodPicker && (
        <PeriodPickerModal
          type={typeTab}
          onConfirm={handleConfirmGenerateLong}
          onClose={() => setShowPeriodPicker(false)}
          workRecords={workRecords}
          weeklyReports={weeklyReports}
          settings={settings}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          weeklyReports={weeklyReports}
        />
      )}
    </div>
  );
}
