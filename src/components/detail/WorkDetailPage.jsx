import { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import WorkRecordForm from '../workbench/WorkRecordForm';
import SearchableProjectSelect from '../ui/SearchableProjectSelect';

export default function WorkDetailPage({ workRecords, setWorkRecords }) {
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [editRecord, setEditRecord] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const projects = useMemo(() => [...new Set(workRecords.map(r => r.project).filter(Boolean))].sort(), [workRecords]);

  const filtered = useMemo(() => {
    let list = [...workRecords];
    if (filterProject) list = list.filter(r => r.project === filterProject);
    if (search) list = list.filter(r => r.project.includes(search) || r.content.includes(search));
    if (startDate) list = list.filter(r => r.date >= startDate);
    if (endDate) list = list.filter(r => r.date <= endDate);
    const [field, dir] = sortBy.split('_');
    list.sort((a, b) => {
      const va = field === 'hours' ? a.hours : a[field];
      const vb = field === 'hours' ? b.hours : b[field];
      return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return list;
  }, [workRecords, search, filterProject, startDate, endDate, sortBy]);

  const totalHours = filtered.reduce((s, r) => s + r.hours, 0);
  const uniqueProjects = new Set(filtered.map(r => r.project)).size;

  const handleSave = (form) => {
    setWorkRecords(workRecords.map(r => r.id === editRecord.id ? { ...r, ...form } : r));
    setEditRecord(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
      {/* 筛选工具栏 */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <SearchableProjectSelect
            projects={projects}
            value={filterProject}
            onChange={setFilterProject}
            placeholder="筛选项目…"
            className="flex-1"
          />
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1"
            style={{minWidth:'120px'}}
            placeholder="搜索内容关键词…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span className="text-gray-400 self-center">至</span>
          <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date_desc">日期 ↓</option>
            <option value="date_asc">日期 ↑</option>
            <option value="hours_desc">工时 ↓</option>
            <option value="hours_asc">工时 ↑</option>
          </select>
        </div>
        {/* 统计 */}
        <div className="flex gap-4 text-sm text-gray-500">
          <span>共 <strong className="text-gray-700">{filtered.length}</strong> 条记录</span>
          <span>总工时 <strong className="text-blue-600">{totalHours.toFixed(1)}h</strong> / <strong className="text-blue-600">{(totalHours/7.5).toFixed(1)}人天</strong></span>
          <span>涉及 <strong className="text-gray-700">{uniqueProjects}</strong> 个项目</span>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-300">
            <p className="text-sm">暂无记录</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">日期</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">项目</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">工作内容</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">工时</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec, idx) => (
                <tr key={rec.id} className={`border-t border-gray-50 hover:bg-blue-50 group ${idx % 2 === 0 ? '' : 'bg-gray-50'}`}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{rec.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{rec.project}</td>
                  <td className="px-4 py-3 text-gray-600">{rec.content}</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600 whitespace-nowrap">{rec.hours}h</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                      <button onClick={() => setEditRecord(rec)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(rec.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editRecord && (
        <Modal title="编辑记录" onClose={() => setEditRecord(null)}>
          <WorkRecordForm record={editRecord} date={editRecord.date} projects={projects} onSave={handleSave} onClose={() => setEditRecord(null)} />
        </Modal>
      )}
      {deleteConfirm && (
        <Modal title="确认删除" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-6">确定要删除这条工作记录吗？</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button onClick={() => { setWorkRecords(workRecords.filter(r => r.id !== deleteConfirm)); setDeleteConfirm(null); }} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">删除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
