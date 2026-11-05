/**
 * 搜索框直达网页搜索。
 *
 * 规则（按优先级）：
 * 1. `!g 关键词` 这类前缀：直接用对应站点搜索
 * 2. 看起来像网址（example.com、https://…）：直接打开
 * 3. 其余交给默认搜索引擎
 * 书签匹配优先的判断在调用方：有匹配时回车打开第一个书签，Shift+回车才走这里。
 */

export interface SearchEngine {
  id: string;
  name: string;
  /** `{q}` 会被替换成 URL 编码后的关键词 */
  url: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={q}' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}' },
];

export const DEFAULT_ENGINE_ID = 'google';

/** 快捷前缀：输入 `!gh react` 直接在 GitHub 搜索。 */
export const BANGS: Array<{ bang: string; name: string; url: string }> = [
  { bang: 'g', name: 'Google', url: 'https://www.google.com/search?q={q}' },
  { bang: 'b', name: 'Bing', url: 'https://www.bing.com/search?q={q}' },
  { bang: 'bd', name: '百度', url: 'https://www.baidu.com/s?wd={q}' },
  { bang: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}' },
  { bang: 'gh', name: 'GitHub', url: 'https://github.com/search?q={q}' },
  { bang: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}' },
  { bang: 'bili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword={q}' },
  { bang: 'zh', name: '知乎', url: 'https://www.zhihu.com/search?q={q}' },
  { bang: 'w', name: '维基百科', url: 'https://zh.wikipedia.org/w/index.php?search={q}' },
  { bang: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q={q}' },
];

export const getEngine = (id?: string): SearchEngine =>
  SEARCH_ENGINES.find(engine => engine.id === id) || SEARCH_ENGINES[0];

const fill = (template: string, query: string) => template.replace('{q}', encodeURIComponent(query));

/** 识别 example.com / https://… / localhost:3000 这类输入，避免把网址拿去搜索。 */
export const asDirectUrl = (input: string): string | null => {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).toString(); } catch { return null; }
  }
  if (/^(localhost|[\w-]+(\.[\w-]+)*\.[a-z]{2,})(:\d+)?(\/\S*)?$/i.test(text)) {
    try { return new URL(`https://${text}`).toString(); } catch { return null; }
  }
  return null;
};

/** 解析 `!bang 关键词`；前缀不认识时返回 null，按普通关键词处理。 */
export const parseBang = (input: string): { name: string; url: string } | null => {
  const match = input.trim().match(/^!(\S+)\s+(.+)$/);
  if (!match) return null;
  const bang = BANGS.find(item => item.bang === match[1].toLowerCase());
  return bang ? { name: bang.name, url: fill(bang.url, match[2].trim()) } : null;
};

export const hasBang = (input: string) => parseBang(input) !== null;

/** 把输入解析成要打开的地址与说明；空输入返回 null。 */
export const resolveWebSearch = (input: string, engineId?: string): { url: string; label: string } | null => {
  const text = input.trim();
  if (!text) return null;
  const bang = parseBang(text);
  if (bang) return { url: bang.url, label: `在 ${bang.name} 搜索` };
  const direct = asDirectUrl(text);
  if (direct) return { url: direct, label: '打开网址' };
  const engine = getEngine(engineId);
  return { url: fill(engine.url, text), label: `用 ${engine.name} 搜索` };
};
