import { useState } from 'react';
import Modal from '../ui/Modal';

export default function ProjectDetailModal({ project, workRecords, weeklyReports, startDate, endDate, onClose }) {
  const [tab, setTab] = useState('records');

  const records = workRecords
    .filter(r => r.project === project && r.date >= startDate && r.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const reports = weeklyReports
    .filter(r => r.weekStart >= startDate && r.weekEnd <= endDate &&
      (r.items || []).some(it => it.project === project))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const totalHours = records.reduce((s, r) => s + r.hours, 0);

  return (
    <Modal title={project} onClose={onClose} width="max-w-2xl">
      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('records')}
          className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${tab === 'records' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          工作明细（{records.length}条）
        </button>
        <button
          onClick={() => setTab('reports')}
          className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${tab === 'reports' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          周报记录（{reports.length}份）
        </button>
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
                <span className="flex-1 text-gray-700">{r.content}</span>
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
    </Modal>
  );
}
