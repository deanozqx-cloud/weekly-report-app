import { HOLIDAYS } from './constants';

export const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const today = () => fmt(new Date());

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// 将 'YYYY-MM-DD' 解析为本地时区的 Date（避免 new Date(str) 按 UTC 解析导致跨时区偏移一天）
export const toDate = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const getMonday = (dateStr) => {
  const d = toDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return fmt(d);
};

export const getSunday = (dateStr) => {
  const mon = toDate(getMonday(dateStr));
  mon.setDate(mon.getDate() + 6);
  return fmt(mon);
};

export const addDays = (dateStr, n) => {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

export const isWeekend = (dateStr) => {
  const d = toDate(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
};

export const isHoliday = (dateStr) => !!HOLIDAYS[dateStr];

export const getWeekRange = (mondayStr) => {
  const sun = getSunday(mondayStr);
  const m = toDate(mondayStr);
  const s = toDate(sun);
  return `${m.getMonth()+1}.${m.getDate()}～${s.getMonth()+1}.${s.getDate()}`;
};

export const getCustomRange = (startStr, endStr) => {
  const s = toDate(startStr);
  const e = toDate(endStr);
  return `${s.getMonth()+1}.${s.getDate()}～${e.getMonth()+1}.${e.getDate()}`;
};

export const formatDate = (dateStr) => {
  const d = toDate(dateStr);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
};
