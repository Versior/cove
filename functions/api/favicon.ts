import { isAuthenticated, jsonResponse } from '../_shared/auth';
import { isBlockedHost } from '../_shared/hostGuard';
import { readBody, safeFetch } from '../_shared/safeFetch';

/**
 * 图标代理：由 Cloudflare 边缘抓取站点图标，再回传给浏览器。
 * 浏览器只访问同源的 /api/favicon，不直连 Google，也不受 Chrome ORB 拦截。
 *
 * 取图顺序：
 * 1. 站点自己的 /favicon.ico
 * 2. 站点 HTML 里 <link rel="icon"> 指向的地址
 * 3. 兜底：DuckDuckGo 的 ip3 图标服务
 *
 * 安全：
 * - 鉴权 + SSRF 防护，重定向每一跳都重新校验主机（safeFetch）
 * - 响应带 CSP sandbox 与 nosniff：上游返回的 SVG 即使被直接打开，
 *   也不能在本站源里执行脚本
 */

interface Env {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

const TIMEOUT_MS = 6000;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_HTML_BYTES = 128 * 1024;
const HIT_SECONDS = 60 * 60 * 24 * 7;
const MISS_SECONDS = 60 * 60 * 24;
const USER_AGENT = 'Mozilla/5.0 (compatible; Cove-Favicon/1.0)';

const SAFE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};

const isImage = (type: string) => /^image\//i.test(type) || /octet-stream/i.test(type);

/** 从 HTML 里找 <link rel="...icon..."> 的 href。 */
const findIconHref = (html: string, base: URL): string | null => {
  const linkTags = html.match(/<link[^>]+>/gi) || [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?[^"'>]*icon/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      const resolved = new URL(hrefMatch[1], base);
      if (resolved.protocol === 'https:' || resolved.protocol === 'http:') return resolved.toString();
    } catch { /* 跳过非法 href */ }
  }
  return null;
};

/** 抓一个候选地址，成功返回图片字节与类型，失败返回 null。 */
const tryFetchIcon = async (target: string): Promise<{ body: Uint8Array; type: string } | null> => {
  try {
    const result = await safeFetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!result || !result.response.ok) return null;
    const type = result.response.headers.get('content-type') || '';
    // 有些站点对 favicon 返回 HTML（404 页面），必须排除
    if (!isImage(type)) return null;
    const body = await readBody(result.response, MAX_ICON_BYTES, 'reject');
    if (!body || !body.byteLength) return null;
    return { body, type: type.startsWith('image/') ? type : 'image/x-icon' };
  } catch {
    return null;
  }
};

const findIcon = async (target: URL) => {
  const direct = await tryFetchIcon(`${target.origin}/favicon.ico`);
  if (direct) return direct;

  try {
    const page = await safeFetch(target.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (page?.response.ok && /text\/html/i.test(page.response.headers.get('content-type') || '')) {
      const bytes = await readBody(page.response, MAX_HTML_BYTES, 'truncate');
      const href = bytes ? findIconHref(new TextDecoder().decode(bytes), page.url) : null;
      const fromHtml = href ? await tryFetchIcon(href) : null;
      if (fromHtml) return fromHtml;
    }
  } catch { /* 页面抓不到就继续兜底 */ }

  return tryFetchIcon(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(target.hostname)}.ico`);
};

/** 边缘缓存：成功缓存 7 天，失败缓存 1 天，同一站点不必每次刷新都重新回源。 */
const edgeCache = (): Cache | null => {
  const storage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return storage?.default || null;
};

const iconResponse = (icon: { body: Uint8Array; type: string } | null) => icon
  ? new Response(icon.body, {
    headers: { ...SAFE_HEADERS, 'Content-Type': icon.type, 'Cache-Control': `public, max-age=${HIT_SECONDS}` },
  })
  : new Response(JSON.stringify({ error: 'no icon' }), {
    status: 404,
    headers: { ...SAFE_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${MISS_SECONDS}` },
  });

export const onRequestGet = async (context: { env: Env; request: Request; waitUntil?: (promise: Promise<unknown>) => void }) => {
  const { env, request, waitUntil } = context;

  // <img src> 不会带 Authorization 头，只能靠同源 cookie，所以用 isAuthenticated
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return jsonResponse({ error: 'url required' }, { status: 400 });

  let target: URL;
  try { target = new URL(raw); } catch { return jsonResponse({ error: 'invalid url' }, { status: 400 }); }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return jsonResponse({ error: 'unsupported protocol' }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return jsonResponse({ error: '不支持内网 / 本地地址' }, { status: 400 });
  }

  const cache = edgeCache();
  const cacheKey = new Request(new URL(`/__favicon_cache/${encodeURIComponent(target.origin)}`, request.url).toString());
  const cached = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (cached) return cached;

  const response = iconResponse(await findIcon(target));
  if (cache) {
    const put = cache.put(cacheKey, response.clone()).catch(() => undefined);
    if (waitUntil) waitUntil(put); else await put;
  }
  return response;
};
