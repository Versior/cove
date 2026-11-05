// Browser storage keys used by the application.
export const LOCAL_STORAGE_KEY = 'cove_data_cache';
export const AI_CONFIG_KEY = 'cove_ai_config';
export const SITE_SETTINGS_KEY = 'cove_site_settings';
export const SORT_CONFIG_KEY = 'cove_sort_config';
export const THEME_KEY = 'theme';

/**
 * 一次性迁移：把旧版 cloudnav_* 键搬到 cove_*，已废弃的键直接删除。
 * 必须在 React 渲染前执行，App 的初始 state 会同步读取这些键。
 */
export const migrateLegacyStorage = () => {
  const renames: Array<[string, string]> = [
    ['cloudnav_data_cache', LOCAL_STORAGE_KEY],
    ['cloudnav_ai_config', AI_CONFIG_KEY],
    ['cloudnav_site_settings', SITE_SETTINGS_KEY],
    ['cloudnav_sort_config', SORT_CONFIG_KEY],
  ];
  try {
    for (const [legacy, next] of renames) {
      const value = localStorage.getItem(legacy);
      if (value === null) continue;
      if (localStorage.getItem(next) === null) localStorage.setItem(next, value);
      localStorage.removeItem(legacy);
    }
    localStorage.removeItem('cloudnav_auth_token');
    localStorage.removeItem('cloudnav_search_config');
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可
  }
};
