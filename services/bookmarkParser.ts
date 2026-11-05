import { LinkItem, Category } from '../types';

const generateId = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).substring(2);

/** 浏览器自带的顶层文件夹：里面的书签直接归入「常用推荐」。 */
const ROOT_FOLDERS = ['Bookmarks Bar', 'Bookmarks bar', '书签栏', 'Other Bookmarks', 'Other bookmarks', '其他书签', '收藏夹栏'];

export interface ImportResult {
  links: LinkItem[];
  categories: Category[];
}

/**
 * 只保留网络地址形式的图标。
 * Chrome 导出的 ICON 属性是 base64 data URL，每条 1–3 KB，
 * 原样存下会让每次同步的载荷成倍膨胀；没有图标时由 /api/favicon 兜底。
 */
const pickIcon = (value: string | null) => (value && /^https?:\/\//i.test(value) ? value : undefined);

export const parseBookmarks = async (file: File): Promise<ImportResult> => {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');

  const links: LinkItem[] = [];
  const categories: Category[] = [];
  const categoryMap = new Map<string, string>(); // Name -> ID

  const getCategoryId = (name: string): string => {
    if (!name || ROOT_FOLDERS.includes(name)) return 'common';
    const existing = categoryMap.get(name);
    if (existing) return existing;
    const newId = generateId();
    categories.push({ id: newId, name, icon: 'Folder' });
    categoryMap.set(name, newId);
    return newId;
  };

  // Chrome 结构：<DT><H3>Folder Name</H3><DL> ...items... </DL>
  const traverse = (element: Element, currentCategoryName: string) => {
    for (const node of Array.from(element.children)) {
      if (node.tagName.toUpperCase() !== 'DT') continue;
      const h3 = node.querySelector('h3');
      const a = node.querySelector('a');
      const dl = node.querySelector('dl');

      if (h3 && dl) {
        traverse(dl, h3.textContent || 'Unknown');
      } else if (a) {
        const url = a.getAttribute('href');
        if (!url || !/^https?:\/\//i.test(url)) continue;
        links.push({
          id: generateId(),
          title: a.textContent || url,
          url,
          categoryId: getCategoryId(currentCategoryName),
          createdAt: Date.now(),
          order: links.length,
          icon: pickIcon(a.getAttribute('icon_uri')),
        });
      }
    }
  };

  const rootDl = doc.querySelector('dl');
  // 根目录的散链接没有文件夹名，传空串让它们归入「常用推荐」
  if (rootDl) traverse(rootDl, '');

  return { links, categories };
};
