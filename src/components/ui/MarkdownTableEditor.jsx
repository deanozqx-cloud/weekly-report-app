// 任意 Markdown 表格的网格编辑器。
// 结构化模式下，两张标准表用各自的富编辑器（工时联动、进度同步），
// 其余表格——范文里的「总项目情况」之类——都落到这里，逐格编辑而非改 Markdown 源码。
export default function MarkdownTableEditor({ rows, onChange }) {
  const grid = rows?.length ? rows : [['', '']];
  const width = Math.max(1, ...grid.map(r => r.length));
  // 行长可能不齐（原表就有缺列），统一补齐再编辑，避免下标越界
  const norm = grid.map(r => [...r, ...Array(Math.max(0, width - r.length)).fill('')]);
  const [head, ...body] = norm;

  const emit = (next) => onChange(next);
  const setCell = (r, c, v) => emit(norm.map((row, i) => i === r ? row.map((cell, j) => (j === c ? v : cell)) : row));
  const addRow = () => emit([...norm, Array(width).fill('')]);
  const removeRow = (r) => emit(norm.filter((_, i) => i !== r));
  const addCol = () => emit(norm.map(row => [...row, '']));
  const removeCol = (c) => emit(norm.map(row => row.filter((_, j) => j !== c)));

  const cellClass = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300';

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${width * 130}px` }}>
          <thead>
            <tr className="bg-gray-50">
              {head.map((cell, c) => (
                <th key={c} className="p-2 border-b border-gray-200 align-top">
                  <div className="flex items-center gap-1">
                    <input
                      className={`${cellClass} font-medium bg-white`}
                      value={cell}
                      placeholder={`列 ${c + 1}`}
                      onChange={e => setCell(0, c, e.target.value)}
                    />
                    {width > 1 && (
                      <button
                        onClick={() => removeCol(c)}
                        title="删除该列"
                        className="text-gray-300 hover:text-red-400 text-sm leading-none shrink-0"
                      >&times;</button>
                    )}
                  </div>
                </th>
              ))}
              <th className="p-2 border-b border-gray-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className={r % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, c) => (
                  <td key={c} className="p-2 align-top">
                    <input className={cellClass} value={cell} onChange={e => setCell(r + 1, c, e.target.value)} />
                  </td>
                ))}
                <td className="p-2 align-top text-center">
                  <button
                    onClick={() => removeRow(r + 1)}
                    title="删除该行"
                    className="text-gray-300 hover:text-red-400 text-lg leading-none"
                  >&times;</button>
                </td>
              </tr>
            ))}
            {!body.length && (
              <tr><td colSpan={width + 1} className="text-center text-gray-300 text-sm py-3">暂无数据行</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 px-3 py-2 bg-gray-50 border-t border-gray-100">
        <button onClick={addRow} className="text-xs text-blue-600 hover:text-blue-700">+ 添加行</button>
        <button onClick={addCol} className="text-xs text-blue-600 hover:text-blue-700">+ 添加列</button>
      </div>
    </div>
  );
}
