import { useState } from 'react';
import { fmt } from '../../lib/utils';
import { DEFAULT_PROVIDERS } from '../../lib/constants';
import { LONG_TYPES, pickChildReports } from '../../lib/prompts';
import Modal from '../ui/Modal';

// 计算各类型周期的起止日期与显示标签
function periodOf(type, year, seq) {
  if (type === 'monthly') {
    return {
      start: `${year}-${String(seq).padStart(2, '0')}-01`,
      end: fmt(new Date(year, seq, 0)),
      label: `${year}年${seq}月`,
    };
  }
  if (type === 'quarterly') {
    const startMonth = (seq - 1) * 3 + 1;
    return {
      start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      end: fmt(new Date(year, startMonth + 2, 0)),
      label: `${year}年Q${seq}`,
    };
  }
  if (type === 'half') {
    return seq === 1
      ? { start: `${year}-01-01`, end: `${year}-06-30`, label: `${year}年上半年` }
      : { start: `${year}-07-01`, end: `${year}-12-31`, label: `${year}年下半年` };
  }
  // annual
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}年` };
}

export default function PeriodPickerModal({ type, onConfirm, onClose, workRecords, weeklyReports, settings }) {
  const cfg = LONG_TYPES[type];
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curSeq = type === 'monthly' ? curMonth
    : type === 'quarterly' ? Math.ceil(curMonth / 3)
    : type === 'half' ? (curMonth <= 6 ? 1 : 2)
    : 1;
  const [year, setYear] = useState(curYear);
  const [seq, setSeq] = useState(curSeq);
  const [extraMaterial, setExtraMaterial] = useState('');
  const availableProviders = settings?.llm?.providers || DEFAULT_PROVIDERS;
  const [selectedAIProvider, setSelectedAIProvider] = useState(settings?.llm?.default || availableProviders[0]?.id || '');

  // 范文仅半年报/年报开放
  const templateEnabled = type === 'half' || type === 'annual';
  const hasSample = templateEnabled && !!(settings?.reportTemplates?.[type]?.sample || '').trim();

  const { start, end, label } = periodOf(type, year, seq);
  const records = workRecords.filter(r => r.date >= start && r.date <= end);
  const totalHours = records.reduce((s, r) => s + r.hours, 0);
  const { tierLabel, reports: childReports } = pickChildReports(weeklyReports, type, start, end);
  const milestones = (settings?.milestones || []).filter(m => m.date >= start && m.date <= end);
  const existing = weeklyReports.find(r => r.type === type && r.weekStart === start && r.weekEnd === end);

  const seqButtons = type === 'monthly'
    ? Array.from({ length: 12 }, (_, i) => ({ v: i + 1, label: `${i + 1}月` }))
    : type === 'quarterly'
    ? [{ v: 1, label: 'Q1' }, { v: 2, label: 'Q2' }, { v: 3, label: 'Q3' }, { v: 4, label: 'Q4' }]
    : type === 'half'
    ? [{ v: 1, label: '上半年' }, { v: 2, label: '下半年' }]
    : [];

  return (
    <Modal title={`生成${cfg.name}`} onClose={onClose} width="max-w-md">
      <div className="space-y-5">
        {/* 周期选择 */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 justify-center">
            <button onClick={() => setYear(y => y - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 text-xl leading-none">‹</button>
            <span className="font-semibold text-gray-800 w-20 text-center">{year}年</span>
            <button onClick={() => setYear(y => Math.min(curYear, y + 1))} disabled={year >= curYear} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 text-xl leading-none disabled:opacity-30">›</button>
          </div>
          {seqButtons.length > 0 && (
            <div className={`grid gap-1.5 ${type === 'monthly' ? 'grid-cols-6' : type === 'quarterly' ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {seqButtons.map(b => {
                const future = year === curYear && (
                  type === 'monthly' ? b.v > curMonth :
                  type === 'quarterly' ? b.v > Math.ceil(curMonth / 3) :
                  b.v === 2 && curMonth <= 6
                );
                return (
                  <button
                    key={b.v}
                    disabled={future || year > curYear}
                    onClick={() => setSeq(b.v)}
                    className={`text-xs py-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${seq === b.v ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 bg-white'}`}
                  >{b.label}</button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">{label}：{start} ～ {end}</p>
        </div>

        {/* 数据预览 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50 rounded-lg py-3">
            <div className="text-lg font-semibold text-blue-600">{childReports.length}</div>
            <div className="text-xs text-gray-500">份{tierLabel || '下级报告'}</div>
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

        {childReports.length === 0 && records.length > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            该周期没有可用的下级报告，将直接根据每日工作记录汇总。建议先生成并优化{type === 'monthly' ? '各周周报' : '各月月报'}，{cfg.name}质量更高。
          </p>
        )}
        {records.length === 0 && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 text-center">该周期暂无工作记录</p>
        )}
        {existing && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            该周期已有{cfg.name}，生成后将覆盖原有内容（旧内容会存入版本历史）
          </p>
        )}

        {/* 范文状态提示（仅半年报/年报） */}
        {templateEnabled && (
          hasSample ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✓ 已配置{cfg.name}范文，将按范文的结构与文风生成（长文本格式）
            </p>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              未配置范文，将使用默认表格格式。可在「设置 → 报告模板」粘贴往期{cfg.name}作为格式范文
            </p>
          )
        )}

        {/* 补充资料 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            补充资料 <span className="text-gray-400 font-normal">(可选，本次生成一次性使用)</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            rows={4}
            placeholder="粘贴 OKR、业绩数据、团队情况、领导要求等额外材料，AI 会充分利用…"
            value={extraMaterial}
            onChange={e => setExtraMaterial(e.target.value)}
          />
        </div>

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
              disabled={records.length === 0 && childReports.length === 0}
              onClick={() => onConfirm(type, start, end, label, selectedAIProvider, extraMaterial.trim())}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              生成{cfg.name}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
