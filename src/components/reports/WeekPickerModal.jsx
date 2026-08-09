import { useState } from 'react';
import { DEFAULT_PROVIDERS } from '../../lib/constants';
import { today, getMonday, getSunday, addDays, formatDate } from '../../lib/utils';
import Modal from '../ui/Modal';

export default function WeekPickerModal({ onConfirm, onClose, workRecords, weeklyReports, settings }) {
  const thisMonday = getMonday(today());
  const thisSunday = getSunday(today());
  const [startDate, setStartDate] = useState(thisMonday);
  const [endDate, setEndDate]     = useState(thisSunday);
  const availableProviders = settings?.llm?.providers || DEFAULT_PROVIDERS;
  const [selectedAIProvider, setSelectedAIProvider] = useState(settings?.llm?.default || availableProviders[0]?.id || '');

  const isValid = endDate >= startDate;

  const records = isValid ? workRecords.filter(r => r.date >= startDate && r.date <= endDate) : [];
  const totalHours = Math.round(records.reduce((s, r) => s + r.hours, 0) * 100) / 100;
  const existing = weeklyReports.find(r => (r.type || 'weekly') === 'weekly' && r.weekStart === startDate && r.weekEnd === endDate);

  const spanDays = isValid ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) : 6;
  const shiftBack = () => {
    setStartDate(addDays(startDate, -7));
    setEndDate(addDays(endDate, -7));
  };
  const shiftForward = () => {
    setStartDate(addDays(startDate, 7));
    setEndDate(addDays(endDate, 7));
  };
  const goThisWeek = () => { setStartDate(thisMonday); setEndDate(thisSunday); };

  const isThisWeek = startDate === thisMonday && endDate === thisSunday;

  const byDate = {};
  records.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
  const sortedDates = Object.keys(byDate).sort();

  return (
    <Modal title="选择周期" onClose={onClose} width="max-w-md">
      <div className="space-y-5">

        {/* 日期范围选择 */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={shiftBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 text-xl leading-none shrink-0" title="整体前移一周">‹</button>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1">
                <div className="text-xs text-gray-400 mb-1 text-center">开始日期</div>
                <input
                  type="date"
                  className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={startDate}
                  onChange={e => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (v > endDate) setEndDate(v);
                  }}
                />
              </div>
              <span className="text-gray-400 text-sm shrink-0 mt-4">—</span>
              <div className="flex-1">
                <div className="text-xs text-gray-400 mb-1 text-center">结束日期</div>
                <input
                  type="date"
                  className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <button onClick={shiftForward} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 text-xl leading-none shrink-0" title="整体后移一周">›</button>
          </div>

          {/* 快捷标签 */}
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <button
              onClick={goThisWeek}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${isThisWeek ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
            >本周（周一—周日）</button>
            <button
              onClick={() => { setStartDate(addDays(thisMonday, -7)); setEndDate(addDays(thisSunday, -7)); }}
              className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >上周</button>
            {isValid && spanDays !== 6 && (
              <span className="text-xs text-gray-400">共 {spanDays + 1} 天</span>
            )}
          </div>
        </div>

        {/* 工作记录预览 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">所选时段工作记录</span>
            {records.length > 0 && (
              <span className="text-xs text-gray-400">{records.length} 条，共 <span className="text-blue-600 font-medium">{totalHours}h</span></span>
            )}
          </div>
          {!isValid ? (
            <div className="text-center py-4 text-red-400 bg-red-50 rounded-lg text-xs">结束日期不能早于开始日期</div>
          ) : records.length === 0 ? (
            <div className="text-center py-6 text-gray-300 bg-gray-50 rounded-lg">
              <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <p className="text-xs">该时段暂无工作记录</p>
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden max-h-44 overflow-y-auto scrollbar-thin">
              {sortedDates.map(date => (
                <div key={date} className="border-b border-gray-50 last:border-0">
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-500 flex justify-between">
                    <span>{formatDate(date)}</span>
                    <span className="text-blue-500">{byDate[date].reduce((s,r)=>s+r.hours,0)}h</span>
                  </div>
                  {byDate[date].map(r => (
                    <div key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-medium text-gray-700 shrink-0">{r.project}</span>
                      <span className="text-gray-400">·</span>
                      <span className="truncate">{r.content}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 覆盖提示 */}
        {existing && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span className="text-xs text-amber-700">该时段已有周报，生成后将覆盖原有内容</span>
          </div>
        )}

        {/* AI 模型选择 + 操作按钮 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">AI 模型</span>
            <select
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              value={selectedAIProvider}
              onChange={e => setSelectedAIProvider(e.target.value)}
            >
              {availableProviders.map(p => (
                <option key={p.id} value={p.id}>{p.label || p.name || p.id}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button
              disabled={!isValid}
              onClick={() => onConfirm(startDate, endDate, records.length === 0, selectedAIProvider)}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              生成周报
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
