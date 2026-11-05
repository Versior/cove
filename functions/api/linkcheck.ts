import { jsonResponse, requireAuth } from '../_shared/auth';
import { isBlockedHost } from '../_shared/hostGuard';
import { safeFetch } from '../_shared/safeFetch';

/**
 * 链接可达性探测，失效链接检测与自建服务在线状态共用。
 * POST { urls: string[] }（每批最多 MAX_BATCH 条）→ { results: ProbeResult[] }
 *
 * 只返回原始结果（状态码 / 错误 / 耗时），怎么判定「失效」「离线」交给前端：
 * 两个场景的标准不同，比如 403 对失效检测是「不确定」，对服务状态却说明服务活着。
 *
 * 每条链接最多 1 次 HEAD + 1 次 GET 回退，每次最多跟随 3 跳重定向；
 * 批量上限保证单次请求的子请求数留在 Workers 限额以内。
 */

interface Env {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

export interface ProbeResult {
  url: string;
  /** 最终响应的状态码；网络错误、超时或被拦截时为 0 */
  status: number;
  /** network：连不上 / DNS 失败；timeout：超时；blocked：内网等不支持探测的地址 */
  error?: 'network' | 'timeout' | 'blocked';
  finalUrl?: string;
  ms: number;
}

const MAX_BATCH = 8;
const TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Cove-LinkCheck/1.0)';

const probeUrl = async (raw: string): Promise<ProbeResult> => {
  const started = Date.now();
  let target: URL;
  try { target = new URL(raw); } catch { return { url: raw, status: 0, error: 'blocked', ms: 0 }; }
  if ((target.protocol !== 'https:' && target.protocol !== 'http:') || isBlockedHost(target.hostname)) {
    return { url: raw, status: 0, error: 'blocked', ms: 0 };
  }

  const attempt = async (method: 'HEAD' | 'GET') => {
    const result = await safeFetch(target.toString(), {
      method,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // GET 只为拿状态码，不读响应体
    await result?.response.body?.cancel().catch(() => undefined);
    return result;
  };

  try {
    let result = await attempt('HEAD');
    // 不少站点对 HEAD 返回 403/405/501，换 GET 再确认一次
    if (result && [403, 405, 501].includes(result.response.status)) result = await attempt('GET');
    if (!result) return { url: raw, status: 0, error: 'blocked', ms: Date.now() - started };
    return { url: raw, status: result.response.status, finalUrl: result.url.toString(), ms: Date.now() - started };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { url: raw, status: 0, error: timeout ? 'timeout' : 'network', ms: Date.now() - started };
  }
};

export const onRequestPost = async (context: { env: Env; request: Request }) => {
  const { env, request } = context;
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  try {
    const body = await request.json() as { urls?: unknown };
    const urls = Array.isArray(body.urls) ? body.urls.filter((url): url is string => typeof url === 'string').slice(0, MAX_BATCH) : [];
    if (!urls.length) return jsonResponse({ error: 'urls required' }, { status: 400 });
    return jsonResponse({ results: await Promise.all(urls.map(probeUrl)) });
  } catch {
    return jsonResponse({ error: 'Invalid request' }, { status: 400 });
  }
};
