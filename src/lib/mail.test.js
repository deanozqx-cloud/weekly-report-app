import { describe, it, expect } from 'vitest';
import { matchContacts, mergeContacts, fillSubject, isEmail, splitAddresses } from './mail';

const C = (email, count = 1) => ({ email, count, lastUsedAt: '2026-09-01T00:00:00.000Z' });

describe('通讯录模糊匹配', () => {
  const contacts = [C('zhouqingxian@corp.com'), C('zhang@corp.com'), C('lisi@corp.com'), C('wangzq@corp.com')];

  it('三档优先级：前缀 > 包含 > 子序列', () => {
    const r = matchContacts(contacts, 'z').map(c => c.email);
    expect(r[0]).toMatch(/^z/);                          // 前缀命中排最前
    expect(r).toContain('wangzq@corp.com');              // 包含命中也在列表里
    expect(r.indexOf('zhang@corp.com')).toBeLessThan(r.indexOf('wangzq@corp.com'));
  });

  it('子序列匹配：zqx 命中 zhouqingxian（按首字母找人）', () => {
    expect(matchContacts(contacts, 'zqx').map(c => c.email)).toEqual(['zhouqingxian@corp.com']);
  });

  it('子序列只在用户名部分生效，不跨 @ 乱命中', () => {
    // 'zcom' 若跨域名匹配会误命中；应当匹配不到
    expect(matchContacts([C('zhou@corp.com')], 'zcom')).toEqual([]);
  });

  it('exclude 剔除已填地址', () => {
    const r = matchContacts(contacts, 'z', { exclude: ['zhang@corp.com'] }).map(c => c.email);
    expect(r).not.toContain('zhang@corp.com');
  });

  it('exclude 不区分大小写与首尾空格', () => {
    const r = matchContacts(contacts, 'z', { exclude: ['  ZHANG@CORP.COM '] }).map(c => c.email);
    expect(r).not.toContain('zhang@corp.com');
  });

  it('空关键词返回全部（按使用频次排序），这是下拉初始态', () => {
    const r = matchContacts([C('a@x.com', 1), C('b@x.com', 5)], '');
    expect(r).toHaveLength(2);
    expect(r[0].email).toBe('b@x.com');
  });

  it('查询大小写不敏感', () => {
    expect(matchContacts([C('zhou@corp.com')], 'ZHOU')).toHaveLength(1);
  });

  it('limit 生效，空输入安全', () => {
    expect(matchContacts(contacts, '', { limit: 2 })).toHaveLength(2);
    expect(matchContacts(undefined, 'x')).toEqual([]);
    expect(matchContacts([{ email: '' }], 'x')).toEqual([]);
  });
});

describe('通讯录累积', () => {
  it('存储时统一小写去空格——这正是 matchContacts 不必转邮箱大小写的前提', () => {
    const [c] = mergeContacts([], ['  ZhouQingXian@Corp.COM ']);
    expect(c.email).toBe('zhouqingxian@corp.com');
    // 与上面的匹配契约对接：存进去是小写，查得到
    expect(matchContacts([c], 'ZQX').map(x => x.email)).toEqual(['zhouqingxian@corp.com']);
  });

  it('老地址累加次数，新地址追加', () => {
    const first = mergeContacts([], ['a@x.com']);
    const second = mergeContacts(first, ['a@x.com', 'b@x.com']);
    expect(second.find(c => c.email === 'a@x.com').count).toBe(2);
    expect(second.map(c => c.email).sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('常用优先排序', () => {
    const sorted = mergeContacts([{ email: 'rare@x.com', count: 1 }, { email: 'often@x.com', count: 9 }], []);
    expect(sorted[0].email).toBe('often@x.com');
  });

  it('非邮箱输入被拦掉，不进通讯录', () => {
    expect(mergeContacts([], ['not-an-email', '', 'a@b'])).toEqual([]);
  });
});

describe('地址与主题', () => {
  it('isEmail 拦掉明显不是邮箱的输入', () => {
    expect(isEmail('a@b.com')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.com')).toBe(false);
  });

  it('splitAddresses 认中英文逗号分号与空白', () => {
    expect(splitAddresses('a@x.com, b@x.com；c@x.com d@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  });

  it('主题模板填充占位符', () => {
    const r = { type: 'weekly', range: '8.31～9.6', weekStart: '2026-08-31' };
    expect(fillSubject('{类型}-{姓名}-{周期}', r, '周某')).toBe('周报-周某-8.31～9.6');
    expect(fillSubject('{年}年{类型}', { ...r, type: 'annual' })).toBe('2026年年报');
  });

  it('姓名为空时不留下多余连字符', () => {
    const r = { type: 'weekly', range: '8.31～9.6' };
    expect(fillSubject('{类型}-{姓名}-{周期}', r, '')).toBe('周报-8.31～9.6');
  });
});
