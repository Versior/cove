/**
 * 链接探测结果的判定，以及调用 /api/linkcheck 的分批逻辑。
 * 服务端只返回原始状态码，这里按两种场景分别解读。
 */

export interface ProbeResult {
  url: string;
  status: number;
  error?: 'network' | 'timeout' | 'blocked';
  finalUrl?: string;
  ms: number;
}

export type LinkHealth = 'ok' | 'broken' | 'uncertain' | 'skipped';
export type ServiceState = 'up' | 'down' | 'unknown';

/**
 * 失效检测：只有「确定打不开」才判为失效。
 * 401/403/429/5xx 常见于需要登录、反爬或临时故障，判为「不确定」，避免误删。
 */
export const classifyLink = (result: ProbeResult): LinkHealth => {
  if (result.error === 'blocked') return 'skipped';
  if (result.error === 'network') return 'broken';
  if (result.error === 'timeout') return 'uncertain';
  if (result.status === 404 || result.status === 410) return 'broken';
  if (result.status >= 200 && result.status < 400) return 'ok';
  return 'uncertain';
};

/**
 * 服务状态：只要服务器给出了 5xx 以下的响应就算在线，401/403 说明服务活着、只是要登录。
 * 连不上、超时、502/503/504 以及 Cloudflare 的 52x 源站错误算离线。
 */
export const classifyService = (result: ProbeResult): ServiceState => {
  if (result.error === 'blocked') return 'unknown';
  if (result.error) return 'down';
  return result.status >= 500 ? 'down' : 'up';
};

export const BATCH_SIZE = 8;

/** 调一次 /api/linkcheck；失败时抛错，由调用方决定是否继续。 */
export const probeBatch = async (urls: string[], signal?: AbortSignal): Promise<ProbeResult[]> => {
  const response = await fetch('/api/linkcheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal,
  });
  if (!response.ok) throw new Error(`检测请求失败（HTTP ${response.status}）`);
  const data = await response.json() as { results?: ProbeResult[] };
  return data.results || [];
};

/**
 * 分批探测全部地址，同时最多 concurrency 批在途。
 * onBatch 每完成一批回调一次，用于更新进度；shouldStop 返回 true 时不再发新批次。
 */
export const probeAll = async (
  urls: string[],
  options: { concurrency?: number; onBatch?: (results: ProbeResult[]) => void; shouldStop?: () => boolean } = {},
): Promise<ProbeResult[]> => {
  const batches: string[][] = [];
  for (let index = 0; index < urls.length; index += BATCH_SIZE) batches.push(urls.slice(index, index + BATCH_SIZE));
  const all: ProbeResult[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length && !options.shouldStop?.()) {
      const batch = batches[cursor++];
      const results = await probeBatch(batch).catch(() => batch.map(url => ({ url, status: 0, error: 'timeout' as const, ms: 0 })));
      all.push(...results);
      options.onBatch?.(results);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency || 2, batches.length) }, worker));
  return all;
};

/** 链接失效时的兜底入口：Internet Archive 的历史快照列表。 */
export const waybackUrl = (url: string) => `https://web.archive.org/web/2*/${url}`;
