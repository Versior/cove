import { isAuthenticated, jsonResponse, requireAuth } from '../_shared/auth';
import {
  getStorageKv,
  LATEST_BACKUP_KEY,
  persistData,
  readLatestBackup,
  readStoredDataWithPresence,
  writeLatestBackup,
  StorageEnv,
} from '../_shared/dataStore';

interface Env extends StorageEnv {
  PASSWORD: string;
  SESSION_SECRET?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

interface AIConfig {
  provider?: 'gemini' | 'openai';
  baseUrl?: string;
  model?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const normalizeAiProvider = (value: unknown): 'gemini' | 'openai' => value === 'openai' ? 'openai' : 'gemini';
const sanitizeAiConfig = (config: AIConfig = {}, env: Env) => {
  const provider = normalizeAiProvider(config.provider);
  return {
    provider,
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '',
    model: typeof config.model === 'string' && config.model.trim() ? config.model.trim() : DEFAULT_MODEL,
    hasApiKey: provider === 'openai' ? !!env.OPENAI_API_KEY : !!env.GEMINI_API_KEY,
  };
};

const readJson = async <T>(kv: KVNamespace, key: string, fallback: T): Promise<T> => {
  const value = await kv.get(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const mergeAiConfig = (existing: AIConfig, incoming: AIConfig) => ({
  provider: normalizeAiProvider(incoming.provider ?? existing.provider),
  baseUrl: incoming.baseUrl !== undefined ? String(incoming.baseUrl).trim() : existing.baseUrl || '',
  model: incoming.model !== undefined && String(incoming.model).trim() ? String(incoming.model).trim() : existing.model || DEFAULT_MODEL,
});

export const onRequestGet = async (context: { env: Env; request: Request }) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const getConfig = url.searchParams.get('getConfig');

  try {
    if (url.searchParams.get('checkAuth') === 'true') {
      return jsonResponse({
        requiresAuth: !!env.PASSWORD,
        authenticated: await isAuthenticated(request, env),
      });
    }

    const authError = await requireAuth(request, env);
    if (authError) return authError;
    const kv = getStorageKv(env);

    if (getConfig === 'website') {
      return jsonResponse(await readJson(kv, 'website_config', {}));
    }

    if (getConfig === 'ai') {
      const aiConfig = await readJson<AIConfig>(kv, 'ai_config', {});
      return jsonResponse(sanitizeAiConfig(aiConfig, env));
    }

    if (url.searchParams.get('getBackup') === 'latest') {
      return jsonResponse(await readLatestBackup(env));
    }

    const stored = await readStoredDataWithPresence(env);
    return jsonResponse({ ...stored.data, initialized: stored.exists });
  } catch {
    return jsonResponse({ error: 'Failed to fetch data' }, { status: 500 });
  }
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => {
  const { request, env, waitUntil } = context;

  const authError = await requireAuth(request, env);
  if (authError) return authError;

  try {
    const body = await request.json() as {
      saveConfig?: string;
      config?: Record<string, unknown>;
      links?: unknown;
      categories?: unknown;
      baseVersion?: number;
    };
    const kv = getStorageKv(env);

    if (body.saveConfig === 'website') {
      await kv.put('website_config', JSON.stringify(body.config || {}));
      return jsonResponse({ success: true });
    }

    if (body.saveConfig === 'ai') {
      const existing = await readJson<AIConfig>(kv, 'ai_config', {});
      const next = mergeAiConfig(existing, body.config || {});
      await kv.put('ai_config', JSON.stringify(next));
      return jsonResponse({ success: true, config: sanitizeAiConfig(next, env) });
    }

    if (!Array.isArray(body.links) || !Array.isArray(body.categories)) {
      return jsonResponse({ error: 'links and categories must be arrays' }, { status: 400 });
    }

    const result = await persistData(env, {
      links: body.links,
      categories: body.categories,
    }, body.baseVersion);

    if (result.conflict === true) {
      return jsonResponse({ error: 'Data conflict', data: result.current }, { status: 409 });
    }

    if (result.changed === false) {
      return jsonResponse({ success: true, changed: false, version: result.data.version, updatedAt: result.data.updatedAt, backup: result.backup });
    }

    const backupPromise = writeLatestBackup(env, result.data, result.hash);
    if (waitUntil) {
      waitUntil(backupPromise.catch(() => undefined));
      return jsonResponse({ success: true, changed: true, version: result.data.version, updatedAt: result.data.updatedAt, backup: { status: 'scheduled', key: LATEST_BACKUP_KEY } });
    }

    const backup = await backupPromise.catch(() => ({ status: 'failed' as const }));
    return jsonResponse({ success: true, changed: true, version: result.data.version, updatedAt: result.data.updatedAt, backup });
  } catch {
    return jsonResponse({ error: 'Failed to save data' }, { status: 500 });
  }
};
