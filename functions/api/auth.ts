import { clearSessionCookie, createSessionCookie, isAuthenticated, jsonResponse, verifyPassword } from '../_shared/auth';

interface Env {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

/** 单实例内的失败计数；跨实例不共享，但足以阻断脚本化连打。 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

const clientKey = (request: Request) => {
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || 'unknown';
};

const hitLimit = (key: string) => {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
};

const clearLimit = (key: string) => attempts.delete(key);

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const authenticated = await isAuthenticated(context.request, context.env);
  return jsonResponse({
    authenticated,
    requiresAuth: !!context.env.PASSWORD,
  });
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  try {
    const body = await request.json() as { password?: string; action?: string };

    if (body.action === 'logout') {
      return jsonResponse({ success: true }, {
        headers: { 'Set-Cookie': clearSessionCookie() },
      });
    }

    const key = clientKey(request);
    if (hitLimit(key)) {
      return jsonResponse({ error: '尝试次数过多，请稍后再试' }, { status: 429 });
    }

    if (!verifyPassword(body.password || '', env)) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    clearLimit(key);
    return jsonResponse({ success: true }, {
      headers: { 'Set-Cookie': await createSessionCookie(env) },
    });
  } catch {
    return jsonResponse({ error: 'Invalid request' }, { status: 400 });
  }
};
