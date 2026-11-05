/**
 * 判定地址是否为内网 / 本地 / 保留地址。
 *
 * 用途：
 * - `safeFetch` 在每一跳重定向前过滤目标（fetchtitle / favicon）
 * - `api/ai` 校验用户可填的 OpenAI Compatible Base URL，避免带着 Secret 打内网
 *
 * 覆盖 IPv4 变体（十进制整数、超界段）、IPv6（回环 / 链路本地 / ULA / IPv4 映射）
 * 以及 localhost / .local / .internal 等内网域名。
 */
export const isBlockedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  if (!host) return true;

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }

  // IPv4：逐段解析，避免 0x7f.0.0.1、2130706433 等变体绕过
  if (/^\d+$/.test(host)) return true; // 纯十进制整数形式
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some(part => part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播 / 保留
    return false;
  }

  // IPv6：回环、链路本地、唯一本地、IPv4 映射
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // fe80::/10
    const mapped = host.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (mapped) return isBlockedHost(mapped.slice(1).join('.'));
    // WHATWG URL 会把 [::ffff:127.0.0.1] 规范化成十六进制写法 ::ffff:7f00:1
    const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const [high, low] = mappedHex.slice(1).map(part => parseInt(part, 16));
      return isBlockedHost([high >> 8, high & 255, low >> 8, low & 255].join('.'));
    }
    return false;
  }

  return false;
};
