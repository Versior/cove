import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAppData } from '../services/dataNormalization.ts';
import { normalizeOpenAIEndpoint } from '../services/openaiEndpoint.ts';
import { isBlockedHost } from '../functions/_shared/hostGuard.ts';
import { mergeImportedStructure } from '../services/importMerge.ts';
import {
  LATEST_BACKUP_KEY,
  normalizeData,
  persistData,
  writeLatestBackup,
} from '../functions/_shared/dataStore.ts';

test('normalizes links: dedupes, drops invalid, and moves orphans to common', () => {
  const data = normalizeAppData({
    categories: [
      { id: 'tools', name: '工具', icon: 'Wrench' },
      { id: 'tools', name: '重复分类' },
    ],
    links: [
      { id: '1', title: 'Example', url: 'https://example.com', categoryId: 'missing', note: 'keep me' },
      { id: '1', title: 'duplicate', url: 'https://duplicate.example' },
      { id: 'invalid', title: 'missing url' },
    ],
    version: 4.8,
  });

  assert.equal(data.version, 4);
  assert.deepEqual(data.categories.map(category => category.id), ['common', 'tools']);
  assert.equal(data.links.length, 1);
  assert.equal(data.links[0].categoryId, 'common');
  assert.equal(data.links[0].note, 'keep me');
});

test('normalizes OpenAI-compatible endpoints and rejects webpage URLs', () => {
  assert.equal(
    normalizeOpenAIEndpoint('https://api.openai.com/v1'),
    'https://api.openai.com/v1/chat/completions',
  );
  assert.equal(
    normalizeOpenAIEndpoint('https://api.deepseek.com'),
    'https://api.deepseek.com/chat/completions',
  );
  assert.throws(() => normalizeOpenAIEndpoint('https://chat.openai.com'), /网页地址/);
  assert.throws(() => normalizeOpenAIEndpoint(''), /不能为空/);
});

test('keeps categories whose ids match old CloudNav defaults, with their links', () => {
  const data = normalizeAppData({
    categories: [
      { id: 'common', name: '常用推荐', icon: 'Star' },
      { id: 'dev', name: '开发工具', icon: 'Code' },
      { id: 'ai', name: '人工智能', icon: 'Bot' },
    ],
    links: [
      { id: 'd', title: 'GitHub', url: 'https://github.com', categoryId: 'dev' },
      { id: 'g', title: 'ChatGPT', url: 'https://chat.openai.com', categoryId: 'ai' },
    ],
  });

  // 导入旧备份时不能静默删掉用户的分类和链接
  assert.deepEqual(data.categories.map(category => category.id), ['common', 'dev', 'ai']);
  assert.deepEqual(data.links.map(link => link.categoryId), ['dev', 'ai']);
});

test('import merges folders by name instead of dumping them into common', () => {
  const existing = [
    { id: 'common', name: '常用推荐', icon: 'Star' },
    { id: 'tools-existing', name: '工具', icon: 'Wrench' },
  ];
  const imported = [
    { id: 'tools-new', name: '工具', icon: 'Folder' },
    { id: 'read-new', name: '阅读', icon: 'Folder' },
  ];
  const links = [
    { id: '1', title: 'A', url: 'https://a.example', categoryId: 'tools-new', createdAt: 1 },
    { id: '2', title: 'B', url: 'https://b.example', categoryId: 'read-new', createdAt: 1 },
    { id: '3', title: 'C', url: 'https://c.example', categoryId: 'common', createdAt: 1 },
  ];

  const merged = mergeImportedStructure(links, imported, existing);

  assert.deepEqual(merged.categories.map(category => category.id), ['read-new']);
  assert.deepEqual(merged.links.map(link => link.categoryId), ['tools-existing', 'read-new', 'common']);
});

class MemoryKv {
  private values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) || null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async list() {
    return { objects: [] };
  }
}

class MemoryR2 {
  puts: Array<{ key: string; value: string; metadata?: Record<string, string> }> = [];
  private objects = new Map<string, { value: string; metadata?: Record<string, string> }>();

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { customMetadata: object.metadata } : null;
  }

  async get() {
    return null;
  }

  async put(key: string, value: string, options?: { customMetadata?: Record<string, string> }) {
    this.objects.set(key, { value, metadata: options?.customMetadata });
    this.puts.push({ key, value, metadata: options?.customMetadata });
  }

  async delete() {}

  async list() {
    return { objects: [] };
  }
}

test('persists versions, detects conflicts, and skips unchanged content', async () => {
  const kv = new MemoryKv();
  const env = { COVE_KV: kv };
  const initial = { links: [], categories: [] };
  const first = await persistData(env, initial, 0);
  assert.equal(first.conflict, false);
  assert.equal(first.changed, false);

  const changed = await persistData(env, {
    links: [{ id: '1', title: 'Example', url: 'https://example.com', categoryId: 'common' }],
    categories: [{ id: 'common', name: '常用推荐' }],
  }, 0);
  assert.equal(changed.conflict, false);
  assert.equal(changed.changed, true);
  if (changed.conflict || !changed.changed) return;
  assert.equal(changed.data.version, 1);

  const conflict = await persistData(env, initial, 0);
  assert.equal(conflict.conflict, true);
  if (!conflict.conflict) return;
  assert.equal(conflict.current.version, 1);
});

test('writes only the fixed latest R2 object and skips the same hash', async () => {
  const kv = new MemoryKv();
  const r2 = new MemoryR2();
  const env = { COVE_KV: kv, COVE_BACKUPS: r2 };
  const data = normalizeData({ links: [], categories: [] });

  const first = await writeLatestBackup(env, data, 'same-hash');
  const second = await writeLatestBackup(env, data, 'same-hash');

  assert.equal(first.status, 'saved');
  assert.equal(second.status, 'skipped');
  assert.equal(r2.puts.length, 1);
  assert.equal(r2.puts[0].key, LATEST_BACKUP_KEY);
  assert.equal(r2.puts[0].metadata?.contentHash, 'same-hash');
});

test('does not let an older backup overwrite a newer stored version', async () => {
  const kv = new MemoryKv();
  const r2 = new MemoryR2();
  const env = { COVE_KV: kv, COVE_BACKUPS: r2 };
  await kv.put('app_data', JSON.stringify({ links: [], categories: [], version: 3 }));

  const result = await writeLatestBackup(env, normalizeData({ links: [], categories: [] }), 'old-hash');

  assert.equal(result.status, 'skipped');
  assert.equal(r2.puts.length, 0);
});

test('blocks private and loopback hosts while allowing public hosts', () => {
  const blocked = [
    'localhost', 'api.localhost', 'nas.local', 'metadata.internal',
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '2130706433',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1',
  ];
  for (const host of blocked) {
    assert.equal(isBlockedHost(host), true, `${host} should be blocked`);
  }

  const allowed = ['api.openai.com', 'api.deepseek.com', '8.8.8.8', '1.1.1.1', 'example.com'];
  for (const host of allowed) {
    assert.equal(isBlockedHost(host), false, `${host} should be allowed`);
  }
});

test('reorders by order field and keeps the drag result visible', async () => {
  const { applySort, applyReorder } = await import('../services/sorting.ts');
  const links = [
    { id: 'a', title: 'AAAA', url: 'https://a.com', categoryId: 'common', createdAt: 1, order: 0 },
    { id: 'b', title: 'BBBB', url: 'https://b.com', categoryId: 'common', createdAt: 2, order: 1 },
    { id: 'c', title: 'CCCC', url: 'https://c.com', categoryId: 'common', createdAt: 3, order: 2 },
  ];

  // 手动模式必须按 order 排，否则拖拽写入的 order 不生效
  assert.deepEqual(
    applySort(links, { key: 'manual', direction: 'asc' }).map(link => link.id),
    ['a', 'b', 'c'],
  );

  const next = applyReorder(links, links, 'a', 'c');
  assert.ok(next);
  assert.deepEqual(
    applySort(next, { key: 'manual', direction: 'asc' }).map(link => link.id),
    ['b', 'c', 'a'],
  );
});

test('refuses to treat corrupted KV data as an empty dataset', async () => {
  const kv = new MemoryKv();
  await kv.put('app_data', '{not json');
  await assert.rejects(() => persistData({ COVE_KV: kv }, { links: [], categories: [] }, 0), /损坏/);
});

test('category lock stores only a salted hash and drops legacy plaintext passwords', async () => {
  const { hashCategoryPassword, verifyCategoryPassword } = await import('../services/categoryLock.ts');
  const hash = await hashCategoryPassword('cat-1', '1234');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, await hashCategoryPassword('cat-2', '1234'), 'same password must hash differently per category');
  assert.equal(await verifyCategoryPassword({ id: 'cat-1', passwordHash: hash }, '1234'), true);
  assert.equal(await verifyCategoryPassword({ id: 'cat-1', passwordHash: hash }, '0000'), false);

  const client = normalizeAppData({ categories: [{ id: 'old', name: '旧分类', icon: 'Folder', password: 'plain' }], links: [] });
  assert.equal('password' in client.categories[1], false);
  const server = normalizeData({ categories: [{ id: 'old', name: '旧分类', password: 'plain' }], links: [] });
  assert.equal('password' in server.categories[1], false);
});

test('web search resolves bangs, direct urls and the default engine', async () => {
  const { resolveWebSearch, asDirectUrl } = await import('../services/webSearch.ts');
  assert.equal(resolveWebSearch('!gh react hooks')?.url, 'https://github.com/search?q=react%20hooks');
  assert.equal(resolveWebSearch('!bd 天气')?.url, 'https://www.baidu.com/s?wd=%E5%A4%A9%E6%B0%94');
  assert.equal(resolveWebSearch('!unknown thing', 'bing')?.url, 'https://www.bing.com/search?q=!unknown%20thing');
  assert.equal(resolveWebSearch('github.com/vercel')?.url, 'https://github.com/vercel');
  assert.equal(resolveWebSearch('cloudflare pages', 'baidu')?.url, 'https://www.baidu.com/s?wd=cloudflare%20pages');
  assert.equal(asDirectUrl('hello world'), null);
  assert.equal(asDirectUrl('react'), null);
  assert.equal(resolveWebSearch('   '), null);
});

test('link checks treat auth and server errors as uncertain, services as up or down', async () => {
  const { classifyLink, classifyService } = await import('../services/linkStatus.ts');
  const r = (status: number, error?: 'network' | 'timeout' | 'blocked') => ({ url: 'https://x.test', status, error, ms: 1 });
  assert.equal(classifyLink(r(200)), 'ok');
  assert.equal(classifyLink(r(404)), 'broken');
  assert.equal(classifyLink(r(0, 'network')), 'broken');
  assert.equal(classifyLink(r(403)), 'uncertain');
  assert.equal(classifyLink(r(0, 'timeout')), 'uncertain');
  assert.equal(classifyLink(r(0, 'blocked')), 'skipped');
  assert.equal(classifyService(r(401)), 'up');
  assert.equal(classifyService(r(502)), 'down');
  assert.equal(classifyService(r(0, 'timeout')), 'down');
  assert.equal(classifyService(r(0, 'blocked')), 'unknown');
});

test('tag rename merges into an existing tag without duplicates', async () => {
  const { collectTags, renameTag, deleteTag } = await import('../services/tags.ts');
  const links = [
    { id: '1', title: 'A', url: 'https://a.test', categoryId: 'common', createdAt: 1, tags: ['js', 'JavaScript'] },
    { id: '2', title: 'B', url: 'https://b.test', categoryId: 'common', createdAt: 1, tags: ['js'] },
    { id: '3', title: 'C', url: 'https://c.test', categoryId: 'common', createdAt: 1 },
  ];
  assert.deepEqual(collectTags(links), [{ tag: 'js', count: 2 }, { tag: 'JavaScript', count: 1 }]);
  const merged = renameTag(links, 'js', 'JavaScript');
  assert.deepEqual(merged.map(link => link.tags), [['JavaScript'], ['JavaScript'], undefined]);
  assert.equal(merged[2], links[2], 'untouched links keep their identity');
  assert.deepEqual(deleteTag(merged, 'JavaScript').map(link => link.tags), [[], [], undefined]);
});

test('spaces: children follow their top-level parent and unknown spaces fall back to the first', async () => {
  const { normalizeSpaces, spaceOfCategory, categoryIdsInSpace } = await import('../services/spaces.ts');
  const spaces = normalizeSpaces([{ id: 'main', name: '桌面 1' }, { id: 'work', name: '工作' }, { id: 'work', name: '重复' }]);
  assert.deepEqual(spaces.map(space => space.id), ['main', 'work']);
  assert.deepEqual(normalizeSpaces(null).map(space => space.id), ['main']);
  const categories = [
    { id: 'common', name: '常用推荐', icon: 'Star' },
    { id: 'dev', name: '开发', icon: 'Code', spaceId: 'work' },
    { id: 'dev-fe', name: '前端', icon: 'Folder', parentId: 'dev' },
    { id: 'old', name: '旧', icon: 'Folder', spaceId: 'deleted-space' },
  ];
  assert.equal(spaceOfCategory('dev-fe', categories, spaces), 'work');
  assert.equal(spaceOfCategory('old', categories, spaces), 'main');
  assert.deepEqual([...categoryIdsInSpace('work', categories, spaces)].sort(), ['dev', 'dev-fe']);
});
