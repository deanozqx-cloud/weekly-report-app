// 周报助手 · 邮件直发（SMTP）
//
// 凭据只存在本函数的环境变量里，不进前端、不进 Git。
// 需要在 Supabase 控制台 → Edge Functions → send-mail → Secrets 配置：
//   SMTP_HOST       必填，如 smtp.example.com
//   SMTP_PORT       选填，默认 587
//   SMTP_USER       登录账号（通常是完整邮箱地址）；与 SMTP_PASS 同时提供才做认证
//   SMTP_PASS       密码或客户端授权码
//   SMTP_FROM       选填，发件地址，默认取 SMTP_USER
//   SMTP_FROM_NAME  选填，发件人显示名
//   SMTP_TLS        选填，implicit | starttls | none | auto（默认 auto：465 用 implicit，其余 starttls）
//                   none = 全程明文，仅在服务器不支持加密时使用，凭据会明文传输
//   SMTP_ALLOW_INSECURE  选填，'true' 时允许在未加密连接上发送凭据
//   MAIL_ALLOWED_ORIGINS 选填，逗号分隔的前端来源白名单
//
// 注意：多数云平台（含本函数运行的 Deno Deploy）封禁出站 25 端口，
// 请优先使用 587（STARTTLS）或 465（隐式 TLS）。
//
// 调用需带 Supabase 用户 JWT（函数默认开启 verify_jwt），未登录无法调用。
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const DEFAULT_ORIGINS = [
  'https://deanozqx-cloud.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(origin: string | null) {
  const allowed = (Deno.env.get('MAIL_ALLOWED_ORIGINS') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const list = allowed.length ? allowed : DEFAULT_ORIGINS;
  const ok = origin && list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : list[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });

// 宽松校验：拦掉明显不是邮箱的输入，不追求 RFC 完备
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const normalizeList = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;，；\s]+/) : [];
  return [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))];
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: '仅支持 POST' }, 405, origin);

  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER') || '';
  const pass = Deno.env.get('SMTP_PASS') || '';
  if (!host || !(user || Deno.env.get('SMTP_FROM'))) {
    return json({
      error: '服务端未配置 SMTP',
      detail: '请在 Supabase → Edge Functions → send-mail → Secrets 配置 SMTP_HOST 与 SMTP_USER（或 SMTP_FROM）',
    }, 500, origin);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400, origin);
  }

  const to = normalizeList(payload.to);
  const cc = normalizeList(payload.cc);
  const subject = String(payload.subject || '').trim();
  const html = String(payload.html || '');
  const text = String(payload.text || '');
  const isTest = payload.mode === 'test';

  const from = Deno.env.get('SMTP_FROM') || user;
  const fromName = Deno.env.get('SMTP_FROM_NAME') || '';

  const recipients = isTest && to.length === 0 ? [from] : to;
  if (!recipients.length) return json({ error: '收件人不能为空' }, 400, origin);
  const bad = [...recipients, ...cc].filter((a) => !EMAIL_RE.test(a));
  if (bad.length) return json({ error: `收件人格式有误：${bad.join('、')}` }, 400, origin);
  if (recipients.length + cc.length > 50) return json({ error: '收件人过多（上限 50）' }, 400, origin);
  if (!subject && !isTest) return json({ error: '主题不能为空' }, 400, origin);
  if (!html && !text && !isTest) return json({ error: '正文不能为空' }, 400, origin);

  const port = Number(Deno.env.get('SMTP_PORT') || 587);
  // implicit：连接即加密（465）｜ starttls：明文握手后升级（587）｜ none：全程明文（部分自建服务器的 25 端口）
  // auto：465 用 implicit，其余 starttls
  const tlsMode = (Deno.env.get('SMTP_TLS') || 'auto').toLowerCase();
  const implicit = tlsMode === 'implicit' || (tlsMode === 'auto' && port === 465);
  const plain = tlsMode === 'none';
  // 明文连接下 denomailer 默认拒绝发送凭据，需显式放行
  const allowUnsecure = plain || Deno.env.get('SMTP_ALLOW_INSECURE') === 'true';

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: implicit,
      // 账号密码都提供时才认证；部分内网服务器允许免认证转发
      auth: user && pass ? { username: user, password: pass } : undefined,
    },
    debug: { allowUnsecure, noStartTLS: plain },
  });

  try {
    await client.send({
      from: fromName ? `${fromName} <${from}>` : from,
      to: recipients,
      cc: cc.length ? cc : undefined,
      subject: isTest && !subject ? '周报助手 SMTP 测试' : subject,
      content: text || '（本邮件为 HTML 格式，请使用支持 HTML 的客户端查看）',
      html: html || '<p>周报助手 SMTP 配置测试成功。</p>',
    });
    await client.close();
    return json({ ok: true, to: recipients, cc, from }, 200, origin);
  } catch (e) {
    try { await client.close(); } catch { /* 关闭失败不掩盖原始错误 */ }
    const msg = e instanceof Error ? e.message : String(e);
    // 常见故障给出可操作的排查方向
    let hint = '';
    if (/auth|535|534|password|credential/i.test(msg)) hint = '认证失败：确认账号与授权码；若服务器禁用基础认证则 SMTP 直发不可用';
    else if (/refus|timeout|connect|dns|unreach/i.test(msg)) hint = '连不上服务器：确认外网是否开放该端口（常见 587/465），以及主机名是否正确';
    else if (/unsecure|insecure|starttls/i.test(msg)) hint = '服务器不支持加密：若确认要明文发送，设置 SMTP_TLS=none（注意凭据将明文传输）';
    else if (/certificate|tls|ssl/i.test(msg)) hint = 'TLS 握手失败：尝试 SMTP_TLS=implicit（端口 465）或 starttls（端口 587）';
    else if (/relay|denied|not permitted|550|553/i.test(msg)) hint = '服务器拒绝转发：发件地址需与登录账号一致，或该账号无对外发信权限';
    return json({ error: '发送失败', detail: msg, hint }, 502, origin);
  }
});
