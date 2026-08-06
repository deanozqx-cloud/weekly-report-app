import { DEFAULT_PROVIDERS } from './constants';

export async function callAI(settings, prompt, { maxTokens = 4096 } = {}) {
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
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.content[0].text;
  } else {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

// 从「AI 初稿 vs 用户修改稿」中提炼写作规则（风格画像）。
// 返回更新后的完整规则列表（合并已有规则，最多 10 条）；失败时抛错由调用方静默处理。
export async function distillStyleRules(settings, aiDraft, userFinal, existingRules = []) {
  const prompt = `你是写作风格分析师。下面是一份 AI 生成的工作周报初稿，以及用户修改后的最终稿。
请对比两者差异，提炼出用户的写作偏好规则，供以后生成周报时遵守。

【AI 初稿】
${aiDraft}

【用户最终稿】
${userFinal}

【已有规则】
${existingRules.length ? existingRules.map(r => `- ${r}`).join('\n') : '（无）'}

要求：
1. 输出合并后的完整规则列表：保留仍然成立的已有规则，加入新发现的规则，合并重复项
2. 规则必须具体可执行（如「工作内容用"动词+对象+结果"句式」「删除"积极配合"类修饰语」），不要空泛描述
3. 最多 10 条，每行一条，以"- "开头
4. 只输出规则列表，不要其他说明`;
  const result = await callAI(settings, prompt);
  const rules = result.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- ') || l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!rules.length) throw new Error('未提炼出规则');
  return rules;
}

// AI 精修：逐行审稿，删水话、改具体，保留事实与表格结构
export async function refineReport(settings, markdown, styleRules = [], maxTokens = 4096) {
  const rulesBlock = styleRules.length
    ? `\n【用户写作规则（必须遵守）】\n${styleRules.map(r => `- ${r}`).join('\n')}\n`
    : '';
  const prompt = `你是严格的周报审稿人。请逐行审校下面的工作报告并输出修改后的完整 Markdown。

审校要求：
1. 删除无信息量的套话（如"持续推进""稳步开展""有序进行""积极配合""不断完善"）
2. 模糊表述改为具体：写清楚做了什么、产出了什么、结果如何
3. 不得编造原文没有的工作内容、数据或结论；信息不足的句子宁可精简也不要注水
4. 保留原有的章节结构、表格结构和表头，保留问候语
5. 表格中人工填写的"项目进度"值保持不变
${rulesBlock}
【待审校报告】
${markdown}

只输出修改后的完整 Markdown，不要其他说明。`;
  return callAI(settings, prompt, { maxTokens });
}
