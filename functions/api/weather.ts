import { jsonResponse, requireAuth } from '../_shared/auth';

/**
 * 菜单栏天气：代理 Open-Meteo（免 Key），结果放边缘 Cache API。
 * - GET ?city=杭州            → 城市候选（地理编码）
 * - GET ?lat=30.29&lon=120.16 → 当前天气 + 今日最高最低温
 * 走同源代理而不是浏览器直连：省去跨域与可达性问题，多设备也能共用缓存。
 */

interface Env {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

const TIMEOUT_MS = 8000;
const FORECAST_SECONDS = 15 * 60;
const GEOCODE_SECONDS = 7 * 24 * 60 * 60;

const edgeCache = (): Cache | null => (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default || null;

const cached = async (key: string, ttl: number, load: () => Promise<unknown>, waitUntil?: (p: Promise<unknown>) => void) => {
  const cache = edgeCache();
  const request = new Request(key);
  const hit = cache ? await cache.match(request).catch(() => undefined) : undefined;
  if (hit) return hit;
  const response = jsonResponse(await load(), { headers: { 'Cache-Control': `public, max-age=${ttl}` } });
  if (cache) {
    const put = cache.put(request, response.clone()).catch(() => undefined);
    if (waitUntil) waitUntil(put); else await put;
  }
  return response;
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`上游返回 HTTP ${response.status}`);
  return response.json() as Promise<Record<string, any>>;
};

const toCoordinate = (value: string | null, limit: number) => {
  const number = Number(value);
  return value !== null && Number.isFinite(number) && Math.abs(number) <= limit ? Math.round(number * 100) / 100 : null;
};

export const onRequestGet = async (context: { env: Env; request: Request; waitUntil?: (p: Promise<unknown>) => void }) => {
  const { env, request, waitUntil } = context;
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const origin = url.origin;
  try {
    const city = url.searchParams.get('city')?.trim();
    if (city) {
      if (city.length > 60) return jsonResponse({ error: '城市名称过长' }, { status: 400 });
      return await cached(`${origin}/__weather_cache/geo/${encodeURIComponent(city)}`, GEOCODE_SECONDS, async () => {
        const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=6&language=zh&format=json`);
        const results = Array.isArray(data.results) ? data.results : [];
        return {
          results: results.map((item: Record<string, unknown>) => ({
            name: String(item.name || ''),
            region: [item.admin1, item.country].filter(Boolean).join(' · '),
            latitude: Number(item.latitude),
            longitude: Number(item.longitude),
          })),
        };
      }, waitUntil);
    }

    // 坐标保留两位小数（约 1 公里），同一城市的请求能命中同一份缓存
    const lat = toCoordinate(url.searchParams.get('lat'), 90);
    const lon = toCoordinate(url.searchParams.get('lon'), 180);
    if (lat === null || lon === null) return jsonResponse({ error: '需要 city 或有效的 lat/lon' }, { status: 400 });
    return await cached(`${origin}/__weather_cache/now/${lat},${lon}`, FORECAST_SECONDS, async () => {
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
      return {
        temperature: Number(data.current?.temperature_2m),
        code: Number(data.current?.weather_code),
        isDay: data.current?.is_day === 1,
        max: Number(data.daily?.temperature_2m_max?.[0]),
        min: Number(data.daily?.temperature_2m_min?.[0]),
        updatedAt: Date.now(),
      };
    }, waitUntil);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : '天气获取失败' }, { status: 502 });
  }
};
