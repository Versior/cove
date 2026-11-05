import type { Category } from '../types.ts';

/**
 * 分类密码只是「显示锁」：防同屏窥视，不加密书签数据本身。
 * 只存哈希，避免明文密码随 KV、R2 备份和 JSON 导出到处流转。
 * 盐里带上分类 id，同一个密码在不同分类下的哈希也不同。
 */
export const hashCategoryPassword = async (categoryId: string, password: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`cove-category:${categoryId}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const verifyCategoryPassword = async (category: Pick<Category, 'id' | 'passwordHash'>, password: string): Promise<boolean> =>
  !!category.passwordHash && category.passwordHash === await hashCategoryPassword(category.id, password);
