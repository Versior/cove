interface SessionPayload {
  exp: number;
  scope?: 'session';
}

export interface AuthEnv {
  PASSWORD: string;
  SESSION_SECRET?: string;
}

const COOKIE_NAME = 'cove_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlEncodeString = (value: string) => base64UrlEncode(encoder.encode(value));

const base64UrlDecodeString = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const getSigningKey = async (env: AuthEnv) => {
  const secret = env.SESSION_SECRET || env.PASSWORD;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
};

const sign = async (value: string, env: AuthEnv) => {
  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
};

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};

const getCookie = (request: Request, name: string) => {
  const cookie = request.headers.get('Cookie') || '';
  const parts = cookie.split(';').map(part => part.trim());
  const prefix = `${name}=`;
  const match = parts.find(part => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
};

const verifyToken = async (token: string, env: AuthEnv, scope: SessionPayload['scope']) => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = await sign(payload, env);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  try {
    const decoded = JSON.parse(base64UrlDecodeString(payload)) as SessionPayload;
    if (typeof decoded.exp !== 'number' || decoded.exp <= Math.floor(Date.now() / 1000)) return false;
    return decoded.scope === scope;
  } catch {
    return false;
  }
};

/** 前端与 API 同源部署，不需要 CORS 头，也不需要处理 OPTIONS 预检。 */
export const jsonResponse = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
});

export const createSessionCookie = async (env: AuthEnv) => {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    scope: 'session',
  };
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await sign(encodedPayload, env);
  return `${COOKIE_NAME}=${encodedPayload}.${signature}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
};

export const clearSessionCookie = () => `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export const isAuthenticated = async (request: Request, env: AuthEnv) => {
  if (!env.PASSWORD) return false;
  const token = getCookie(request, COOKIE_NAME);
  return token ? verifyToken(token, env, 'session') : false;
};

export const requireAuth = async (request: Request, env: AuthEnv) => {
  if (!env.PASSWORD) {
    return jsonResponse({ error: 'Server misconfigured: PASSWORD not set' }, { status: 500 });
  }

  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
};

export const verifyPassword = (password: string, env: AuthEnv) => {
  if (!env.PASSWORD) return false;
  return timingSafeEqual(password, env.PASSWORD);
};
