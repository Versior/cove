import { jsonResponse, requireAuth } from '../_shared/auth';
import { isBlockedHost } from '../_shared/hostGuard';
import { readBody, safeFetch } from '../_shared/safeFetch';

interface Env {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
  if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
});

// 服务端抓取网页 <title>，免 CORS。鉴权 + SSRF 防护，重定向每一跳都重新校验主机。
export const onRequestGet = async (context: { env: Env; request: Request }) => {
  const { env, request } = context;

  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return jsonResponse({ error: 'url required' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(target); } catch { return jsonResponse({ error: 'invalid url' }, { status: 400 }); }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return jsonResponse({ error: 'unsupported protocol' }, { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    return jsonResponse({ error: '不支持内网 / 本地地址' }, { status: 400 });
  }

  try {
    const result = await safeFetch(parsed.toString(), {
      headers: { 'User-Agent': 'Cove/1.0 (+bookmark title fetch)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!result) return jsonResponse({ error: '目标地址或跳转不被允许' }, { status: 400 });
    if (!result.response.ok) return jsonResponse({ title: '' });

    const bytes = await readBody(result.response, MAX_BYTES, 'truncate');
    const html = bytes ? new TextDecoder().decode(bytes) : '';
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? decodeEntities(match[1].replace(/\s+/g, ' ').trim()) : '';
    return jsonResponse({ title });
  } catch {
    return jsonResponse({ error: 'fetch failed' }, { status: 502 });
  }
};
