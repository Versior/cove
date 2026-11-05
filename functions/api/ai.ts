import { jsonResponse, requireAuth } from '../_shared/auth';
import { getStorageKv, StorageEnv } from '../_shared/dataStore';
import { isBlockedHost } from '../_shared/hostGuard';
import { normalizeOpenAIEndpoint } from '../../services/openaiEndpoint';

interface Env extends StorageEnv {
  PASSWORD: string;
  SESSION_SECRET?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

type AITask = 'description' | 'category' | 'test' | 'folder_rename' | 'folder_structure';
type RequestConfig = { provider?: 'gemini' | 'openai'; baseUrl?: string; model?: string };
type ResolvedConfig = { provider: 'gemini' | 'openai'; baseUrl: string; model: string; apiKey: string };

const parseProviderError = (raw: string) => {
  try {
    const data = JSON.parse(raw) as any;
    return String(data?.error?.message || data?.error || data?.message || raw);
  } catch {
    return raw;
  }
};
const isHtml = (text: string) => /^<!doctype\s+html/i.test(text.trim()) || /^<html[\s>]/i.test(text.trim());
const parseProviderJson = (provider: string, raw: string) => {
  if (isHtml(raw)) throw new Error(`${provider} 返回了 HTML 错误页，请检查接口地址。`);
  try { return raw ? JSON.parse(raw) as any : {}; } catch { throw new Error(`${provider} 返回的不是合法 JSON。`); }
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const retryAfter = (response: Response) => {
  const value = Number(response.headers.get('retry-after') || 0);
  return Number.isFinite(value) && value > 0 ? Math.min(value * 1000, 15000) : 0;
};

const readAiConfig = async (env: Env, requestConfig: RequestConfig = {}): Promise<ResolvedConfig> => {
  const kv = getStorageKv(env);
  const raw = await kv.get('ai_config');
  let stored: RequestConfig = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      stored = {
        provider: parsed.provider === 'openai' ? 'openai' : 'gemini',
        baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
        model: typeof parsed.model === 'string' ? parsed.model : '',
      };
    } catch {
      stored = {};
    }
  }
  const provider = requestConfig.provider === 'openai' || requestConfig.provider === 'gemini'
    ? requestConfig.provider
    : stored.provider || 'gemini';
  const baseUrl = requestConfig.baseUrl !== undefined ? String(requestConfig.baseUrl).trim() : stored.baseUrl || '';
  const model = requestConfig.model !== undefined && String(requestConfig.model).trim()
    ? String(requestConfig.model).trim()
    : stored.model || 'gemini-2.5-flash';
  const apiKey = provider === 'openai' ? env.OPENAI_API_KEY || '' : env.GEMINI_API_KEY || '';
  return { provider, baseUrl, model, apiKey };
};

const validateConfig = (config: ResolvedConfig) => {
  if (!config.apiKey) throw new Error(`${config.provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} Secret 未配置`);
  if (!config.model || /^https?:\/\//i.test(config.model)) throw new Error('模型名称无效');
  if (config.provider === 'openai') {
    const endpoint = normalizeOpenAIEndpoint(config.baseUrl);
    if (isBlockedHost(new URL(endpoint).hostname)) throw new Error('API 地址不支持内网 / 本地主机');
  }
};

const callGemini = async (config: ResolvedConfig, prompt: string) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // Key 放请求头而不是 URL query，避免进入任何访问日志
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(30000) });
    const raw = await response.text();
    if (response.ok) return parseProviderJson('Gemini', raw).candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim() || '';
    const detail = parseProviderError(raw).slice(0, 240);
    if (![429, 502, 503].includes(response.status) || attempt === 3) throw new Error(`Gemini 请求失败：HTTP ${response.status}，${detail}`);
    await wait(retryAfter(response) || attempt * 1000);
  }
  throw new Error('Gemini 请求失败');
};

const callOpenAI = async (config: ResolvedConfig, system: string, user: string, temperature: number) => {
  const endpoint = normalizeOpenAIEndpoint(config.baseUrl);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature }), signal: AbortSignal.timeout(30000) });
    const raw = await response.text();
    if (response.ok) return parseProviderJson('OpenAI Compatible', raw).choices?.[0]?.message?.content?.trim() || '';
    const detail = parseProviderError(raw).slice(0, 240);
    if (![429, 502, 503].includes(response.status) || attempt === 3) throw new Error(`OpenAI Compatible 请求失败：HTTP ${response.status}，${detail}`);
    await wait(retryAfter(response) || attempt * 1000);
  }
  throw new Error('OpenAI Compatible 请求失败');
};

const cleanFolderName = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/^["'「『【\[]+|["'」』】\]]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const categoryIdFrom = (text: string, categories: Array<{ id: string }>) => {
  const cleaned = text.trim().replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/i, '').replace(/^['"]|['"]$/g, '').trim();
  return categories.find(category => category.id === cleaned)?.id
    || categories.find(category => new RegExp(`(^|[^A-Za-z0-9_-])${category.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_-]|$)`).test(cleaned))?.id
    || null;
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const authError = await requireAuth(request, env);
  if (authError) return authError;
  try {
    const body = await request.json() as { task?: AITask; title?: string; url?: string; categories?: Array<{ id: string; name: string }>; folderName?: string; samples?: string[]; links?: Array<{ id: string; title: string; url: string; description?: string }>; existingNames?: string[]; config?: RequestConfig };
    const task = body.task;
    if (!task || !['description', 'category', 'test', 'folder_rename', 'folder_structure'].includes(task)) return jsonResponse({ error: 'Invalid AI task', retryable: false }, { status: 400 });
    const config = await readAiConfig(env, body.config);
    validateConfig(config);
    const prompt = task === 'test'
      ? 'Reply with exactly OK.'
      : task === 'description'
        ? `用简体中文写 15 字以内的网站用途说明。标题：${body.title}\n网址：${body.url}`
        : task === 'category'
          ? `网站：${body.title} (${body.url})\n分类：${(body.categories || []).map(category => `${category.id}: ${category.name}`).join('\n')}\n只返回分类 ID。`
          : task === 'folder_rename'
            ? `文件夹：${body.folderName}\n书签：${(body.samples || []).join('\n')}\n只返回新的中文文件夹名称。`
            : `父文件夹：${body.folderName}\n现有名称：${(body.existingNames || []).join('、')}\n书签：${(body.links || []).map(link => `${link.id}|${link.title}|${link.url}`).join('\n')}\n返回 JSON：{"rename":"","reason":"","folders":[{"name":"","linkIds":[],"reason":""}],"keepInParent":[]}`;
    const system = task === 'category' ? 'You classify bookmarks and output only a valid category ID.' : task === 'folder_structure' ? 'You reorganize bookmark folders. Return valid JSON only.' : 'You are a concise bookmark assistant.';
    const text = config.provider === 'gemini' ? await callGemini(config, `${system}\n${prompt}`) : await callOpenAI(config, system, prompt, task === 'folder_structure' ? 0.2 : 0.3);
    if (task === 'category') return jsonResponse({ text: categoryIdFrom(text, body.categories || []), provider: config.provider, retryable: false });
    if (task === 'folder_rename') return jsonResponse({ text: cleanFolderName(text), provider: config.provider, retryable: false });
    return jsonResponse({ text, provider: config.provider, retryable: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    const retryable = /429|限流|502|503|timeout|超时/i.test(message);
    return jsonResponse({ error: message.slice(0, 320), provider: 'unknown', retryable }, { status: retryable ? 503 : 502 });
  }
};
