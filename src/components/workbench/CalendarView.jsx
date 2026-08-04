import { useState, useMemo } from 'react';
import { HOLIDAYS, WORKDAYS } from '../../lib/constants';
import { today, toDate, isWeekend } from '../../lib/utils';

export default function CalendarView({ workRecords, selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = viewDate;
  const todayStr = today();

  const hoursByDate = useMemo(() => {
    const map = {};
    workRecords.forEach(r => {
      if (!map[r.date]) map[r.date] = 0;
      map[r.date] += r.hours;
    });
    return map;
  }, [workRecords]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const prevMonth = () => {
    if (month === 0) setViewDate({ year: year - 1, month: 11 });
    else setViewDate({ year, month: month - 1 });
  };
  const nextMonth = () => {
    if (month === 11) setViewDate({ year: year + 1, month: 0 });
    else setViewDate({ year, month: month + 1 });
  };
  const goToday = () => {
    const d = new Date();
    setViewDate({ year: d.getFullYear(), month: d.getMonth() });
    onSelectDate(todayStr);
  };

  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const WEEKDAYS = ['一','二','三','四','五','六','日'];

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(dateStr);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">&#8249;</button>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">{year}年 {MONTHS[month]}</span>
          <button onClick={goToday} className="text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded-full">今天</button>
        </div>
        <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">&#8250;</button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-xs text-gray-400 font-medium py-1">{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dateStr, idx) => {
          if (!dateStr) return <div key={`e-${idx}`} />;

          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const holiday = HOLIDAYS[dateStr];
          const workday = WORKDAYS[dateStr];
          const weekend = isWeekend(dateStr) && !workday;
          const hours = hoursByDate[dateStr];

          let bgClass = 'hover:bg-gray-50';
          let textClass = 'text-gray-700';

          if (isSelected) { bgClass = 'bg-blue-600'; textClass = 'text-white'; }
          else if (holiday) { bgClass = 'bg-red-50 hover:bg-red-100'; textClass = 'text-red-600'; }
          else if (workday) { bgClass = 'bg-purple-50 hover:bg-purple-100'; textClass = 'text-purple-700'; }
          else if (weekend) { bgClass = 'bg-orange-50 hover:bg-orange-100'; textClass = 'text-orange-500'; }

          return (
            <div
              key={dateStr}
              className={`calendar-day relative flex flex-col items-center justify-center rounded-lg cursor-pointer py-1 px-0.5 ${bgClass}`}
              style={{minHeight:'52px'}}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className={`text-sm font-medium ${textClass} ${isToday && !isSelected ? 'ring-2 ring-blue-400 rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
                {toDate(dateStr).getDate()}
              </span>
              {holiday && (
                <span className={`text-xs leading-tight text-center ${isSelected ? 'text-blue-100' : 'text-red-400'}`} style={{fontSize:'9px',lineHeight:'1.1',maxWidth:'100%'}}>
                  {holiday}
                </span>
              )}
              {!holiday && workday && (
                <span className={`text-xs leading-tight text-center ${isSelected ? 'text-blue-100' : 'text-purple-500'}`} style={{fontSize:'9px',lineHeight:'1.1'}}>
                  {workday}
                </span>
              )}
              {hours != null && (
                <span className={`text-xs font-medium mt-0.5 ${isSelected ? 'text-blue-100' : 'text-blue-500'}`} style={{fontSize:'10px'}}>
                  {hours}h
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-50">
        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-blue-600 inline-block"></span>选中</span>
        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-red-100 inline-block"></span>节假日</span>
        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-purple-100 inline-block"></span>调休补班</span>
        <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-200 inline-block"></span>周末</span>
      </div>
    </div>
  );
}
