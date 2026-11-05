import type { Category, LinkItem } from '../types.ts';

/**
 * 「保留原结构」导入：按分类名称合并。
 *
 * 导入文件里的分类 id 和现有分类 id 不同，但名称可能相同。
 * 同名分类不新建，链接改挂到现有分类；不同名的才作为新分类加入。
 * importedCategories 必须是导入文件里的全部分类（不能预先过滤掉同名的），
 * 否则同名分类下的链接找不到归属，会被错误地放进「常用推荐」。
 */
export const mergeImportedStructure = (
  links: LinkItem[],
  importedCategories: Category[],
  existingCategories: Category[],
): { links: LinkItem[]; categories: Category[] } => {
  const nameToId = new Map(existingCategories.map(category => [category.name, category.id]));
  const existingIds = new Set(existingCategories.map(category => category.id));
  const importedById = new Map(importedCategories.map(category => [category.id, category]));
  const categoriesToAdd: Category[] = [];

  for (const category of importedCategories) {
    if (nameToId.has(category.name)) continue;
    categoriesToAdd.push(category);
    nameToId.set(category.name, category.id);
  }

  const remapped = links.map(link => {
    const source = importedById.get(link.categoryId);
    if (source) return { ...link, categoryId: nameToId.get(source.name) || 'common' };
    // 导入文件没声明这个分类：id 恰好是现有分类时保留，否则归入「常用推荐」
    return { ...link, categoryId: existingIds.has(link.categoryId) ? link.categoryId : 'common' };
  });

  return { links: remapped, categories: categoriesToAdd };
};
