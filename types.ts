export interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  description?: string;
  categoryId: string;
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  pinned?: boolean;
  pinnedOrder?: number;
  order?: number;
  visitCount?: number;
  lastVisitedAt?: number;
  /** 备注：可编辑，参与搜索，悬停卡片时显示。 */
  note?: string;
  /** 在卡片上显示在线状态（适合自建服务）。 */
  monitor?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  /** 分类显示锁的密码哈希（见 services/categoryLock.ts），不存明文。 */
  passwordHash?: string;
  parentId?: string;
  /** 所在桌面；只对顶层分类生效，子分类跟随父分类。缺省归第一个桌面。 */
  spaceId?: string;
}

/** 一个桌面（类似 macOS 的 Spaces），见 services/spaces.ts。 */
export interface Space {
  id: string;
  name: string;
}

/** 菜单栏天气的位置。 */
export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export type CardStyle = SiteSettings['cardStyle'];
/** 内置壁纸预设。 */
export type WallpaperPreset = 'sonoma' | 'ventura' | 'monterey' | 'graphite' | 'custom';
/** 全局密度：同时控制书签卡片与侧栏分类的尺寸。 */
export type Density = 'compact' | 'cozy' | 'spacious';

export interface SiteSettings {
  title: string;
  navTitle: string;
  favicon: string;
  cardStyle: 'detailed' | 'simple' | 'list' | 'icon';
  /** 卡片与侧栏的尺寸档位，缺省视为 cozy。 */
  density?: Density;
  /** 壁纸：预设 id（如 'sonoma'）或自定义图片 URL；留空用默认渐变。 */
  wallpaper?: string;
  /** 壁纸预设 id，缺省视为 sonoma。 */
  wallpaperPreset?: WallpaperPreset;
  /** 壁纸暗化程度 0-100，越大字越清晰。 */
  wallpaperDim?: number;
  /** 搜索框直达网页搜索时用的默认引擎 id，见 services/webSearch.ts。 */
  searchEngine?: string;
  /** 菜单栏天气位置；为空时不显示天气。 */
  weather?: WeatherLocation | null;
  /** 桌面列表；只有一个时不显示切换器。 */
  spaces?: Space[];
}

export type AIProvider = 'gemini' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  baseUrl: string;
  model: string;
  hasApiKey?: boolean;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'common', name: '常用推荐', icon: 'Star' },
];


/** 首次使用的示例数据：只保留少数常用站点，不再预置分类与示例站群。 */
export const INITIAL_LINKS: LinkItem[] = [
  { id: 's1', title: 'Google', url: 'https://www.google.com', categoryId: 'common', createdAt: Date.now(), description: '全球最大的搜索引擎', pinned: true },
  { id: 's2', title: '百度', url: 'https://www.baidu.com', categoryId: 'common', createdAt: Date.now(), description: '国内主流搜索引擎', pinned: true },
  { id: 'n1', title: 'IT之家', url: 'https://www.ithome.com', categoryId: 'common', createdAt: Date.now(), description: '数码科技资讯平台', pinned: true },
];
