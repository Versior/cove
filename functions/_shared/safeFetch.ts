import { isBlockedHost } from './hostGuard';

const MAX_REDIRECTS = 3;

const isAllowedTarget = (url: URL) =>
  (url.protocol === 'https:' || url.protocol === 'http:') && !isBlockedHost(url.hostname);

/**
 * 对外抓取的唯一入口：手动跟随重定向，每一跳都重新校验主机。
 * 直接用 redirect: 'follow' 时，公网地址可以 302 到内网，绕过 isBlockedHost。
 * 目标不合法或跳转过多时返回 null；网络错误照常抛出，由调用方处理。
 */
export const safeFetch = async (target: string, init: RequestInit = {}): Promise<{ response: Response; url: URL } | null> => {
  let url: URL;
  try { url = new URL(target); } catch { return null; }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedTarget(url)) return null;
    const response = await fetch(url.toString(), { ...init, redirect: 'manual' });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) return { response, url };
    try { url = new URL(location, url); } catch { return null; }
  }
  return null;
};

/**
 * 按上限读取响应体，避免把超大响应整块读进内存。
 * overflow = 'truncate' 时返回前 maxBytes 字节；'reject' 时超限返回 null。
 */
export const readBody = async (response: Response, maxBytes: number, overflow: 'truncate' | 'reject'): Promise<Uint8Array | null> => {
  const declared = Number(response.headers.get('content-length') || 0);
  if (overflow === 'reject' && declared > maxBytes) return null;
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > maxBytes) {
      await reader.cancel();
      if (overflow === 'reject') return null;
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};
