import { describe, it, expect } from 'vitest';
import { toDate, fmt, getMonday, getSunday, addDays, isWeekend, getWeekRange, getCustomRange, formatDate } from './utils';

describe('日期工具', () => {
  it('toDate 按本地时区解析，不会因 UTC 解析偏移一天', () => {
    // new Date('2026-08-31') 在 UTC+8 会落到 8/31 08:00，但在 UTC-5 会落到 8/30
    const d = toDate('2026-08-31');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-based
    expect(d.getDate()).toBe(31);
  });

  it('fmt 补零到 YYYY-MM-DD', () => {
    expect(fmt(new Date(2026, 0, 4))).toBe('2026-01-04');
  });

  it('周一取自身，周日回退到本周一（不是下周一）', () => {
    expect(getMonday('2026-08-31')).toBe('2026-08-31'); // 周一
    expect(getMonday('2026-09-02')).toBe('2026-08-31'); // 周三
    expect(getMonday('2026-09-06')).toBe('2026-08-31'); // 周日：day===0 的分支
  });

  it('getSunday 取同一周的周日', () => {
    expect(getSunday('2026-08-31')).toBe('2026-09-06');
    expect(getSunday('2026-09-06')).toBe('2026-09-06');
  });

  it('addDays 跨月与跨年', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('isWeekend 只认周六周日', () => {
    expect(isWeekend('2026-09-05')).toBe(true);  // 六
    expect(isWeekend('2026-09-06')).toBe(true);  // 日
    expect(isWeekend('2026-09-04')).toBe(false); // 五
  });

  it('区间标签用于报告标题', () => {
    expect(getWeekRange('2026-08-31')).toBe('8.31～9.6');
    expect(getCustomRange('2026-08-31', '2026-09-06')).toBe('8.31～9.6');
    expect(formatDate('2026-09-06')).toBe('2026年9月6日');
  });
});
