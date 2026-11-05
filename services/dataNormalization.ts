import type { Category, LinkItem } from '../types.ts';

const normalizeCategories = (value: unknown): Category[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const categories = source
    .filter((item): item is Category => !!item && typeof item === 'object' && typeof (item as Category).id === 'string' && typeof (item as Category).name === 'string')
    .filter(category => {
      if (seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    })
    // 旧版把分类密码明文存在 password 字段里，不再读取也不再存回
    .map(({ password: _plaintext, ...category }: Category & { password?: unknown }) => category);
  if (!seen.has('common')) categories.unshift({ id: 'common', name: '常用推荐', icon: 'Star' });
  return categories;
};

const normalizeLinks = (value: unknown, categories: Category[] = []): LinkItem[] => {
  const categoryIds = new Set(categories.map(category => category.id));
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter(item => typeof item.id === 'string' && typeof item.title === 'string' && typeof item.url === 'string')
    .filter(item => {
      const id = String(item.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(item => {
      const categoryId = String(item.categoryId || 'common');
      return { ...item, categoryId: categoryIds.has(categoryId) ? categoryId : 'common' } as LinkItem;
    });
};

export const normalizeAppData = (value: unknown) => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const categories = normalizeCategories(record.categories);
  const links = normalizeLinks(record.links, categories);
  return {
    links,
    categories,
    version: typeof record.version === 'number' && Number.isFinite(record.version) ? Math.max(0, Math.floor(record.version)) : 0,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : undefined,
  };
};
