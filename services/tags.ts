import type { LinkItem } from '../types.ts';

export interface TagStat {
  tag: string;
  count: number;
}

const cleanTag = (tag: string) => tag.trim().replace(/\s+/g, ' ');

/** 全部标签及使用次数，按次数降序、同次数按名称排序。 */
export const collectTags = (links: LinkItem[]): TagStat[] => {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.deletedAt) continue;
    for (const tag of new Set(link.tags || [])) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
};

/**
 * 重命名标签；新名字已存在时就是合并。
 * 同一条书签上合并后出现的重复标签会去重，未改动的书签保持原对象不变。
 */
export const renameTag = (links: LinkItem[], from: string, to: string): LinkItem[] => {
  const target = cleanTag(to);
  if (!target || target === from) return links;
  const now = Date.now();
  return links.map(link => {
    if (!link.tags?.includes(from)) return link;
    const tags = Array.from(new Set(link.tags.map(tag => (tag === from ? target : tag))));
    return { ...link, tags, updatedAt: now };
  });
};

/** 从所有书签上移除某个标签。 */
export const deleteTag = (links: LinkItem[], tag: string): LinkItem[] => {
  const now = Date.now();
  return links.map(link => {
    if (!link.tags?.includes(tag)) return link;
    return { ...link, tags: link.tags.filter(item => item !== tag), updatedAt: now };
  });
};
