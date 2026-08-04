import { useState, useRef } from 'react';
import { formatDate } from '../../lib/utils';

export default function WorkRecordForm({ record, date, projects, onSave, onClose, defaultHours }) {
  const [form, setForm] = useState({
    project: record?.project || '',
    content: record?.content || '',
    hours: record?.hours || defaultHours || 8,
  });
  const [showProjects, setShowProjects] = useState(false);
  const projRef = useRef(null);

  const filtered = projects.filter(p => p.toLowerCase().includes((form.project||'').toLowerCase())).slice(0, 8);

  const handleSave = () => {
    if (!form.project.trim()) { alert('请填写项目名称'); return; }
    if (!form.content.trim()) { alert('请填写工作内容'); return; }
    if (!form.hours || form.hours < 0.5 || form.hours > 24) { alert('工时请填写0.5~24之间的数字'); return; }
    onSave({ ...form, hours: parseFloat(form.hours) });
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 font-medium">日期：{formatDate(date)}</div>

      {/* 项目 */}
      <div className="relative" ref={projRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">项目 <span className="text-red-400">*</span></label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="输入或选择项目名称"
          value={form.project}
          onChange={e => { setForm({...form, project: e.target.value}); setShowProjects(true); }}
          onFocus={() => setShowProjects(true)}
          onBlur={() => setTimeout(() => setShowProjects(false), 150)}
        />
        {showProjects && filtered.length > 0 && (
          <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 overflow-hidden">
            {filtered.map(p => (
              <div key={p} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50" onMouseDown={() => { setForm({...form, project: p}); setShowProjects(false); }}>{p}</div>
            ))}
          </div>
        )}
      </div>

      {/* 工作内容 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">工作内容 <span className="text-red-400">*</span></label>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          rows={3}
          placeholder="描述今天完成的工作..."
          value={form.content}
          onChange={e => setForm({...form, content: e.target.value})}
        />
      </div>

      {/* 工时 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">工时（小时）</label>
        <input
          type="number" min="0.5" max="24" step="0.5"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={form.hours}
          onChange={e => setForm({...form, hours: e.target.value})}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
        <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">保存</button>
      </div>
    </div>
  );
}
