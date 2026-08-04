import { DEFAULT_PROVIDERS } from './constants';

export async function callAI(settings, prompt) {
  const providerId = settings.llm.default;
  const providers = settings.llm.providers || DEFAULT_PROVIDERS;
  const cfg = providers.find(p => p.id === providerId);
  if (!cfg) throw new Error(`未找到 provider "${providerId}"，请检查设置`);
  if (!cfg.apiKey) throw new Error(`请先在设置中为「${cfg.label || cfg.id}」配置 API Key`);

  // 错误响应可能不是 JSON（网关 502、HTML 错误页等），安全解析避免掩盖真实错误
  const readError = async (res) => {
    try { const e = await res.json(); return e.error?.message || res.statusText; }
    catch { return `${res.status} ${res.statusText}`; }
  };

  if (cfg.apiType === 'claude') {
    const baseUrl = (cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        // 浏览器直连 Anthropic API 必需此头，否则被 CORS 拦截
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.content[0].text;
  } else {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], max_tokens: 2048 }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
