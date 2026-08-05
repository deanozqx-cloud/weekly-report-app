import { useState } from 'react';
import { fmt, today } from '../../lib/utils';
import { DEFAULT_PROVIDERS } from '../../lib/constants';
import Modal from '../ui/Modal';

// 月份的起止日期
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = fmt(new Date(y, m, 0)); // 当月最后一天
  return { start, end };
}

export default function MonthPickerModal({ onConfirm, onClose, workRecords, weeklyReports, settings }) {
  const thisMonth = today().slice(0, 7);
  const [ym, setYm] = useState(thisMonth);
  const availableProviders = settings?.llm?.providers || DEFAULT_PROVIDERS;
  const [selectedAIProvider, setSelectedAIProvider] = useState(settings?.llm?.default || availableProviders[0]?.id || '');

  const { start, end } = monthRange(ym);
  const records = workRecords.filter(r => r.date >= start && r.date <= end);
  const totalHours = records.reduce((s, r) => s + r.hours, 0);
  const weeklyInPeriod = weeklyReports.filter(r =>
    (r.type || 'weekly') === 'weekly' && r.weekStart <= end && r.weekEnd >= start);
  const milestones = (settings?.milestones || []).filter(m => m.date >= start && m.date <= end);
  const existing = weeklyReports.find(r => r.type === 'monthly' && r.weekStart === start && r.weekEnd === end);

  const lastMonth = () => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <Modal title="生成月报" onClose={onClose} width="max-w-md">
      <div className="space-y-5">
        {/* 月份选择 */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 justify-center">
            <input
              type="month"
              className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={ym}
              max={thisMonth}
              onChange={e => e.target.value && setYm(e.target.value)}
            />
            <button
              onClick={() => setYm(thisMonth)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${ym === thisMonth ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
            >本月</button>
            <button
              onClick={lastMonth}
              className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >上个月</button>
          </div>
          <p className="text-xs text-gray-400 text-center">{start} ～ {end}</p>
        </div>

        {/* 数据预览 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50 rounded-lg py-3">
            <div className="text-lg font-semibold text-blue-600">{weeklyInPeriod.length}</div>
            <div className="text-xs text-gray-500">份周报</div>
          </div>
          <div className="bg-blue-50 rounded-lg py-3">
            <div className="text-lg font-semibold text-blue-600">{totalHours.toFixed(0)}h</div>
            <div className="text-xs text-gray-500">{records.length} 条记录</div>
          </div>
          <div className="bg-blue-50 rounded-lg py-3">
            <div className="text-lg font-semibold text-blue-600">{milestones.length}</div>
            <div className="text-xs text-gray-500">个里程碑</div>
          </div>
        </div>

        {weeklyInPeriod.length === 0 && records.length > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            该月没有周报，将直接根据每日工作记录汇总。建议先生成并优化各周周报，月报质量更高。
          </p>
        )}
        {records.length === 0 && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 text-center">该月暂无工作记录</p>
        )}
        {existing && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            该月已有月报，生成后将覆盖原有内容（旧内容会存入版本历史）
          </p>
        )}

        {/* AI 模型 + 操作 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">AI 模型</span>
            <select
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              value={selectedAIProvider}
              onChange={e => setSelectedAIProvider(e.target.value)}
            >
              {availableProviders.map(p => (
                <option key={p.id} value={p.id}>{p.label || p.id}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button
              disabled={records.length === 0 && weeklyInPeriod.length === 0}
              onClick={() => onConfirm(ym, start, end, selectedAIProvider)}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              生成月报
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
