export const APP_DATA_KEY = 'app_data';
/** R2 固定备份对象键：只维护这一份最新备份。 */
export const LATEST_BACKUP_KEY = 'cove/latest.json';

export interface StorageEnv {
  COVE_KV?: KVNamespace;
  COVE_BACKUPS?: R2Bucket;
}

const getBackupBucket = (env: StorageEnv): R2Bucket | undefined => env.COVE_BACKUPS;

export const getStorageKv = (env: StorageEnv): KVNamespace => {
  if (!env.COVE_KV) throw new Error('KV 绑定未配置：请绑定 COVE_KV');
  return env.COVE_KV;
};

export interface StoredData {
  links: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  version: number;
  updatedAt?: number;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const cleanCategories = (value: unknown): Record<string, unknown>[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const categories = source
    .map(asRecord)
    .filter(category => typeof category.id === 'string' && typeof category.name === 'string')
    .filter(category => {
      const id = String(category.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    // 服务端同样丢弃旧版的明文分类密码，防止它被写进 KV 和 R2 备份
    .map(({ password: _plaintext, ...category }) => category);

  if (!seen.has('common')) categories.unshift({ id: 'common', name: '常用推荐', icon: 'Star' });
  return categories;
};

const cleanLinks = (value: unknown, categoryIds: Set<string>): Record<string, unknown>[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return source
    .map(asRecord)
    .filter(link => typeof link.id === 'string' && typeof link.title === 'string' && typeof link.url === 'string')
    .filter(link => {
      const id = String(link.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(link => {
      const categoryId = String(link.categoryId || 'common');
      return { ...link, categoryId: categoryIds.has(categoryId) ? categoryId : 'common' };
    });
};

export const normalizeData = (value: unknown): StoredData => {
  const record = asRecord(value);
  const categories = cleanCategories(record.categories);
  const categoryIds = new Set(categories.map(category => String(category.id)));
  const links = cleanLinks(record.links, categoryIds);
  const version = typeof record.version === 'number' && Number.isFinite(record.version) && record.version >= 0
    ? Math.floor(record.version)
    : 0;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : undefined;
  return { links, categories, version, updatedAt };
};

const contentOf = (data: StoredData) => ({ links: data.links, categories: data.categories });

export const hashData = async (data: StoredData): Promise<string> => {
  const encoded = new TextEncoder().encode(JSON.stringify(contentOf(data)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * 读取当前数据。KV 里的值损坏时直接抛错：
 * 若当成空数据返回，下一次保存就会把损坏但可能可修复的数据整体覆盖掉。
 */
export const readStoredDataWithPresence = async (env: StorageEnv) => {
  const raw = await getStorageKv(env).get(APP_DATA_KEY);
  if (!raw) return { data: normalizeData({}), exists: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('KV 中的书签数据已损坏，拒绝读写');
  }
  return { data: normalizeData(parsed), exists: true };
};

export const readStoredData = async (env: StorageEnv): Promise<StoredData> =>
  (await readStoredDataWithPresence(env)).data;

let latestBackupQueue: Promise<void> = Promise.resolve();

export const writeLatestBackup = async (env: StorageEnv, data: StoredData, hash: string) => {
  const bucket = getBackupBucket(env);
  if (!bucket) return { status: 'missing-binding' as const };
  const operation = latestBackupQueue.then(async () => {
    // Do not let an older request overwrite a newer KV version after a race.
    const current = await readStoredData(env);
    if (current.version > data.version) {
      return { status: 'skipped' as const, key: LATEST_BACKUP_KEY };
    }

    const existing = await bucket.head(LATEST_BACKUP_KEY);
    const existingHash = existing?.customMetadata?.contentHash;
    const existingVersion = Number(existing?.customMetadata?.version || NaN);
    if (existingHash === hash || (Number.isFinite(existingVersion) && existingVersion > data.version)) {
      return { status: 'skipped' as const, key: LATEST_BACKUP_KEY };
    }

    await bucket.put(LATEST_BACKUP_KEY, JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { contentHash: hash, version: String(data.version) },
    });
    return { status: 'saved' as const, key: LATEST_BACKUP_KEY };
  });

  // A failed backup must not poison later writes in the same Pages isolate.
  latestBackupQueue = operation.then(() => undefined, () => undefined);
  return operation;
};

/** 读取 R2 最新备份，供前端「从云端备份恢复」使用。 */
export const readLatestBackup = async (env: StorageEnv) => {
  const bucket = getBackupBucket(env);
  if (!bucket) return { status: 'missing-binding' as const };
  const object = await bucket.get(LATEST_BACKUP_KEY);
  if (!object) return { status: 'empty' as const };
  return { status: 'found' as const, data: normalizeData(await object.json()) };
};

let persistQueue: Promise<void> = Promise.resolve();

type PersistResult =
  | { conflict: true; current: StoredData }
  | { conflict: false; changed: false; data: StoredData; backup: { status: 'skipped' } }
  | { conflict: false; changed: true; data: StoredData; hash: string };

export const persistData = (
  env: StorageEnv,
  input: { links: unknown; categories: unknown },
  baseVersion?: number
): Promise<PersistResult> => {
  const operation = persistQueue.then(async () => {
    const current = await readStoredData(env);
    if (typeof baseVersion === 'number' && baseVersion !== current.version) {
      return { conflict: true as const, current };
    }

    const nextContent = normalizeData({ links: input.links, categories: input.categories });
    const currentHash = await hashData(current);
    const nextHash = await hashData(nextContent);
    if (currentHash === nextHash) {
      return { conflict: false as const, changed: false as const, data: current, backup: { status: 'skipped' as const } };
    }

    const data: StoredData = {
      ...nextContent,
      version: current.version + 1,
      updatedAt: Date.now(),
    };
    await getStorageKv(env).put(APP_DATA_KEY, JSON.stringify(data));
    return { conflict: false as const, changed: true as const, data, hash: nextHash };
  });

  // A rejected operation must not block the next request handled by this isolate.
  persistQueue = operation.then(() => undefined, () => undefined);
  return operation;
};
