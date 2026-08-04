import { useState } from 'react';
import * as XLSX from 'xlsx';
import { fmt, today, getSunday, getMonday } from '../../lib/utils';
import Modal from '../ui/Modal';

export default function ImportModal({ onClose, onImport, weeklyReports }) {
  const [preview, setPreview] = useState(null);
  const [conflict, setConflict] = useState('skip');
  const [error, setError] = useState('');

  function parseDateCell(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return fmt(val);
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return fmt(d);
    }
    if (typeof val === 'string') {
      // 带年份：如「2025年5月9日」
      const my = val.match(/(\d{4})年\s*(\d+)月(\d+)/);
      if (my) return `${my[1]}-${String(my[2]).padStart(2,'0')}-${String(my[3]).padStart(2,'0')}`;
      const m = val.match(/(\d+)月(\d+)/);
      if (m) {
        // 无年份默认当前年；导入的是历史数据，若结果在未来则回退到上一年
        const year = new Date().getFullYear();
        let dateStr = `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
        if (dateStr > today()) dateStr = `${year - 1}${dateStr.slice(4)}`;
        return dateStr;
      }
      const d = new Date(val);
      if (!isNaN(d)) return fmt(d);
    }
    return null;
  }

  function detectCol(keys, ...keywords) {
    return keys.find(k => keywords.some(kw => k.includes(kw))) || null;
  }

  const handleFile = async (e) => {
    setError('');
    setPreview(null);
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { setError('表格为空或格式不支持'); return; }

      const keys = Object.keys(rows[0]);
      const colDate    = detectCol(keys, '日期');
      const colProject = detectCol(keys, '项目');
      const colContent = detectCol(keys, '内容');
      const colHours   = detectCol(keys, '时', '工时', '小时');
      const colWeekNum = detectCol(keys, '周数', '周次');

      if (!colDate || !colProject || !colContent) {
        setError('未找到必要列（日期、项目、内容），请检查表格表头');
        return;
      }

      const weekMap = {};
      let skipped = 0;
      rows.forEach(row => {
        const dateStr = parseDateCell(row[colDate]);
        if (!dateStr) { skipped++; return; }
        const project = String(row[colProject] || '').trim();
        const content = String(row[colContent] || '').trim();
        if (!project && !content) { skipped++; return; }

        const weekEnd   = getSunday(dateStr);
        const weekStart = getMonday(dateStr);
        const weekNum   = colWeekNum ? row[colWeekNum] : '';
        const hours     = colHours ? (parseFloat(row[colHours]) || 0) : 0;

        if (!weekMap[weekEnd]) weekMap[weekEnd] = { weekEnd, weekStart, weekNum, records: [] };
        weekMap[weekEnd].records.push({ project, content, hours, date: dateStr });
      });

      const weeks = Object.values(weekMap).sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
      if (!weeks.length) { setError('没有解析到有效数据'); return; }
      setPreview({ weeks, totalRows: rows.length - skipped, skipped });
    } catch (e) {
      setError('解析失败：' + e.message);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    onImport(preview.weeks, conflict);
  };

  const existingWeekEnds = new Set(weeklyReports.map(r => r.weekEnd));
  const conflictCount = preview ? preview.weeks.filter(w => existingWeekEnds.has(w.weekEnd)).length : 0;

  return (
    <Modal title="导入历史数据" onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1.5">选择 Excel 文件（.xlsx / .xls / .csv）</label>
          <input
            type="file" accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
          />
          <p className="text-xs text-gray-400 mt-1">表头需包含：日期、项目、内容（工时列可选）</p>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {preview && (
          <>
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="text-gray-700 font-medium mb-2">
                解析结果：{preview.totalRows} 条记录，{preview.weeks.length} 个周次
                {preview.skipped > 0 && <span className="text-gray-400 ml-1">（跳过 {preview.skipped} 条无效行）</span>}
              </p>
              <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1">
                {preview.weeks.map(w => {
                  const isConflict = existingWeekEnds.has(w.weekEnd);
                  return (
                    <div key={w.weekEnd} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${isConflict ? 'bg-amber-50 text-amber-700' : 'bg-white text-gray-600'}`}>
                      <span>{w.weekNum ? `第${w.weekNum}周 ` : ''}{w.weekStart} ～ {w.weekEnd}</span>
                      <span className="text-gray-400">{w.records.length} 条{isConflict ? ' ⚠️已存在' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {conflictCount > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm text-amber-600 font-medium">有 {conflictCount} 个周次已存在，如何处理？</p>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="conflict" value="skip" checked={conflict === 'skip'} onChange={() => setConflict('skip')} />
                  跳过（保留已有数据）
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="radio" name="conflict" value="overwrite" checked={conflict === 'overwrite'} onChange={() => setConflict('overwrite')} />
                  覆盖（替换为导入数据）
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleConfirm} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                确认导入
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
