import type { Category, Space } from '../types.ts';

/**
 * 多桌面（类似 macOS 的 Spaces）。
 *
 * 桌面列表放在网站设置里，属于布局配置；分类通过 spaceId 归属某个桌面。
 * 子分类跟随顶层父分类所在的桌面。没写 spaceId 或指向已删除桌面的分类都归第一个桌面，
 * 所以删除桌面不需要改书签数据，里面的分类会自然回到第一个桌面。
 */

export const DEFAULT_SPACE: Space = { id: 'main', name: '桌面 1' };
const MAX_SPACES = 9;

export const normalizeSpaces = (value: unknown): Space[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const spaces = source
    .filter((item): item is Space => !!item && typeof item === 'object' && typeof (item as Space).id === 'string' && typeof (item as Space).name === 'string')
    .filter(space => {
      if (seen.has(space.id)) return false;
      seen.add(space.id);
      return true;
    })
    .map(space => ({ id: space.id, name: space.name.trim().slice(0, 16) || '未命名桌面' }))
    .slice(0, MAX_SPACES);
  return spaces.length ? spaces : [DEFAULT_SPACE];
};

/** 分类实际所在的桌面：沿父链找到顶层分类，读它的 spaceId。 */
export const spaceOfCategory = (categoryId: string, categories: Category[], spaces: Space[]): string => {
  const byId = new Map(categories.map(category => [category.id, category]));
  let current = byId.get(categoryId);
  const visited = new Set<string>();
  while (current?.parentId && byId.has(current.parentId) && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  const spaceId = current?.spaceId;
  return spaceId && spaces.some(space => space.id === spaceId) ? spaceId : spaces[0].id;
};

/** 当前桌面里的分类 id 集合（含子分类）。 */
export const categoryIdsInSpace = (spaceId: string, categories: Category[], spaces: Space[]): Set<string> =>
  new Set(categories.filter(category => spaceOfCategory(category.id, categories, spaces) === spaceId).map(category => category.id));

export const makeSpaceId = () => `space-${crypto.randomUUID?.() || Date.now().toString(36)}`;
