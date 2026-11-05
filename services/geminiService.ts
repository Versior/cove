import { Category, LinkItem } from '../types';

/** 前端只负责调用同源 /api/ai；提示词、密钥与上游重试都在服务端处理。 */
type AITask = 'description' | 'category' | 'test' | 'folder_rename' | 'folder_structure';

type ProviderConfig = {
  provider: 'gemini' | 'openai';
  baseUrl: string;
  model: string;
  hasApiKey?: boolean;
};

const isHtml = (text: string) => /<!doctype\s+html/i.test(text.trim()) || /<html[\s>]/i.test(text.trim());
const parseJsonResponse = (rawText: string, provider: string) => {
  if (isHtml(rawText)) throw new Error(`${provider} 返回了 HTML 页面，请检查 Pages Functions 部署状态。`);
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`${provider} 返回的不是合法 JSON：${rawText.slice(0, 120)}`);
  }
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let aiQueue: Promise<unknown> = Promise.resolve();
const enqueueAI = async <T>(fn: () => Promise<T>): Promise<T> => {
  const run = aiQueue.then(fn, fn);
  aiQueue = run.then(() => undefined, () => undefined);
  return run;
};

const withRetry = async <T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/429|限流|timeout|超时|502|503/i.test(message) || attempt === maxAttempts) throw error;
      const delay = Math.min(800 * (2 ** (attempt - 1)), 5000);
      console.warn(`${label} retry ${attempt} after ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
};

const stripCodeFence = (text: string) => text.trim().replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
const cleanFolderName = (name: string) => name.replace(/[\r\n\t]+/g, ' ').replace(/^["'「『【\[]+|["'」』】\]]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);

export interface FolderRenameSuggestion { name: string; reason?: string }
export interface FolderStructureSuggestion {
  rename?: string;
  reason?: string;
  folders: Array<{ name: string; linkIds: string[]; reason?: string }>;
  keepInParent: string[];
}

const sanitizeCategoryResponse = (text: string, categories: Pick<Category, 'id' | 'name'>[] = []) => {
  const cleaned = stripCodeFence(text).replace(/^['"]|['"]$/g, '').trim();
  const ids = categories.map(category => category.id);
  if (ids.includes(cleaned)) return cleaned;
  return ids.find(id => cleaned.includes(id)) || null;
};

const parseFolderRename = (text: string, fallbackName: string): FolderRenameSuggestion => {
  const name = cleanFolderName(stripCodeFence(text));
  if (!name) throw new Error('AI 未返回可用文件夹名称');
  return name === cleanFolderName(fallbackName) ? { name, reason: '保持原名' } : { name };
};

const parseFolderStructure = (text: string, links: Array<{ id: string; title: string; url: string; description?: string }>): FolderStructureSuggestion => {
  let data: any;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 未返回合法的文件夹结构 JSON');
    data = JSON.parse(match[0]);
  }
  const validIds = new Set(links.map(link => link.id));
  const used = new Set<string>();
  const folders: FolderStructureSuggestion['folders'] = [];
  for (const folder of Array.isArray(data.folders) ? data.folders : []) {
    const name = cleanFolderName(String(folder?.name || ''));
    const linkIds = Array.isArray(folder?.linkIds) ? folder.linkIds.map(String).filter((id: string) => validIds.has(id) && !used.has(id)) : [];
    linkIds.forEach(id => used.add(id));
    if (name && linkIds.length) folders.push({ name, linkIds, reason: typeof folder?.reason === 'string' ? folder.reason.slice(0, 80) : undefined });
  }
  const keep = Array.isArray(data.keepInParent) ? data.keepInParent.map(String).filter((id: string) => validIds.has(id) && !used.has(id)) : [];
  keep.forEach(id => used.add(id));
  return {
    rename: data.rename ? cleanFolderName(String(data.rename)) || undefined : undefined,
    reason: typeof data.reason === 'string' ? data.reason.slice(0, 120) : undefined,
    folders,
    keepInParent: [...keep, ...links.map(link => link.id).filter(id => !used.has(id))],
  };
};

const callAI = async (task: AITask, body: Record<string, unknown>, config: ProviderConfig): Promise<string | null> => enqueueAI(async () => {
  const response = await withRetry(async () => fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, ...body, config: { provider: config.provider, baseUrl: config.baseUrl, model: config.model } }),
    signal: AbortSignal.timeout(30000),
  }), 'AI proxy');
  const raw = await response.text().catch(() => '');
  const data = parseJsonResponse(raw, 'AI');
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `AI 请求失败（HTTP ${response.status}）`);
  return typeof data.text === 'string' ? data.text.trim() : null;
});

export const testAIConnection = async (config: ProviderConfig) => (await callAI('test', { title: 'Cove AI Test', url: 'https://example.com' }, config)) || 'OK';
export const generateLinkDescription = async (title: string, url: string, config: ProviderConfig) => {
  const result = await callAI('description', { title, url }, config);
  if (!result) throw new Error('AI 未返回描述内容');
  return result;
};
export const suggestCategory = (title: string, url: string, categories: Pick<Category, 'id' | 'name'>[], config: ProviderConfig) => callAI('category', { title, url, categories }, config).then(result => sanitizeCategoryResponse(result || '', categories));
export const suggestFolderRename = async (folderName: string, samples: string[], config: ProviderConfig) => {
  const result = await callAI('folder_rename', { title: folderName, url: 'https://folder.local/rename', folderName, samples: samples.slice(0, 12) }, config);
  if (!result) throw new Error('AI 未返回文件夹名称');
  return parseFolderRename(result, folderName);
};
export const suggestFolderStructure = async (folderName: string, links: Array<Pick<LinkItem, 'id' | 'title' | 'url' | 'description'>>, existingNames: string[], config: ProviderConfig) => {
  const compactLinks = links.slice(0, 40).map(link => ({ id: link.id, title: link.title, url: link.url, description: link.description }));
  const result = await callAI('folder_structure', { title: folderName, url: 'https://folder.local/structure', folderName, links: compactLinks, existingNames: existingNames.slice(0, 30) }, config);
  if (!result) throw new Error('AI 未返回文件夹结构');
  return parseFolderStructure(result, compactLinks);
};
