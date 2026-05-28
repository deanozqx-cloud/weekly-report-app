import { DEFAULT_PROVIDERS } from './constants';

export async function callAI(settings, prompt) {
  const providerId = settings.llm.default;
  const providers = settings.llm.providers || DEFAULT_PROVIDERS;
  const cfg = providers.find(p => p.id === providerId);
  if (!cfg) throw new Error(`未找到 provider "${providerId}"，请检查设置`);
  if (!cfg.apiKey) throw new Error(`请先在设置中为「${cfg.label || cfg.id}」配置 API Key`);

  if (cfg.apiType === 'claude') {
    const baseUrl = (cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
    const data = await res.json();
    return data.content[0].text;
  } else {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], max_tokens: 2048 }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
