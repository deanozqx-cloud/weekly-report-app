import { useState, useMemo } from 'react';
import { HOLIDAYS } from '../../lib/constants';
import { today, uid, isWeekend, formatDate } from '../../lib/utils';
import { useIsMobile } from '../../lib/hooks';
import Modal from '../ui/Modal';
import WorkRecordForm from './WorkRecordForm';
import CalendarView from './CalendarView';

export default function WorkbenchPage({ workRecords, setWorkRecords, settings }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showCalendar, setShowCalendar] = useState(true);
  const isMobile = useIsMobile();

  const projects = useMemo(() => {
    const set = new Set(workRecords.map(r => r.project).filter(Boolean));
    return [...set].sort();
  }, [workRecords]);

  const dayRecords = useMemo(() =>
    workRecords.filter(r => r.date === selectedDate),
  [workRecords, selectedDate]);

  const dayHours = dayRecords.reduce((s, r) => s + r.hours, 0);
  const holiday = HOLIDAYS[selectedDate];
  const weekend = isWeekend(selectedDate);

  const handleSave = (form) => {
    if (editRecord) {
      setWorkRecords(workRecords.map(r => r.id === editRecord.id ? { ...r, ...form } : r));
    } else {
      setWorkRecords([...workRecords, { id: uid(), date: selectedDate, ...form, createdAt: new Date().toISOString() }]);
    }
    setShowForm(false);
    setEditRecord(null);
  };

  const handleDelete = (id) => {
    setWorkRecords(workRecords.filter(r => r.id !== id));
    setDeleteConfirm(null);
  };

  return (
    <div className={`${isMobile ? 'flex flex-col' : 'flex'} gap-4 h-full`}>
      {/* 日历区 */}
      {(!isMobile || showCalendar) && (
        <div style={isMobile ? {} : {width:'340px',flexShrink:0}}>
          <CalendarView workRecords={workRecords} selectedDate={selectedDate} onSelectDate={d => { setSelectedDate(d); if (isMobile) setShowCalendar(false); }} />
        </div>
      )}

      {/* 工作记录区 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={isMobile ? {minHeight:0} : {}}>
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setShowCalendar(v => !v)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                title="切换日历"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/><line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" strokeWidth="2"/></svg>
              </button>
            )}
            <div>
              <h2 className="font-semibold text-gray-800 text-base">{formatDate(selectedDate)}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {holiday && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{holiday}</span>}
                {!holiday && weekend && <span className="text-xs bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full">周末</span>}
                {dayHours > 0 && <span className="text-xs text-gray-400">合计 <span className="font-medium text-blue-600">{dayHours}h</span></span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => { setEditRecord(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
          >
            <span className="text-base leading-none">+</span> 添加
          </button>
        </div>

        {/* 记录列表 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
          {dayRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-300">
              <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">暂无工作记录，点击「添加」开始记录</p>
            </div>
          ) : dayRecords.map(rec => (
            <div key={rec.id} className="border border-gray-100 rounded-lg p-4 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800 text-sm truncate">{rec.project}</span>
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full shrink-0">{rec.hours}h</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{rec.content}</p>
                  {rec.outcome && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-start gap-1">
                      <span className="shrink-0">🏆</span><span>{rec.outcome}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditRecord(rec); setShowForm(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => setDeleteConfirm(rec.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 工作记录表单弹窗 */}
      {showForm && (
        <Modal title={editRecord ? '编辑记录' : '添加记录'} onClose={() => { setShowForm(false); setEditRecord(null); }}>
          <WorkRecordForm
            record={editRecord}
            date={selectedDate}
            projects={projects}
            defaultHours={settings?.defaultHours}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditRecord(null); }}
          />
        </Modal>
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <Modal title="确认删除" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-6">确定要删除这条工作记录吗？此操作不可恢复。</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium">删除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
