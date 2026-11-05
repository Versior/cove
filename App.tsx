import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Moon, Pin, Plus, Save, Search, Settings, Sun, Upload,
} from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors, KeyboardSensor } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { AIConfig, Category, DEFAULT_CATEGORIES, INITIAL_LINKS, LinkItem, SiteSettings, CardStyle, Density } from './types';
import { LOCAL_STORAGE_KEY, AI_CONFIG_KEY, SITE_SETTINGS_KEY, SORT_CONFIG_KEY, THEME_KEY } from './constants/storageKeys';
import { applyReorder, applySort, canReorder, normalizeSortConfig, type SortConfig } from './services/sorting';
import { normalizeDensity } from './services/density';
import { computeFillCount, useElementHeight, useGridColumns } from './services/fillScreen';
import { applyWallpaper, normalizeWallpaperDim, normalizeWallpaperPreset } from './services/wallpaper';

import { normalizeAppData } from './services/dataNormalization';
import { generateBookmarkHtml, downloadHtmlFile } from './services/exportService';
import { isPinyinReady, loadPinyin, matchesFilters, matchesQuery, parseSearchQuery, sortByRelevance } from './services/searchService';
import type { SettingsTab } from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import BookmarkToolbar from './components/BookmarkToolbar';
import BookmarkGrid from './components/BookmarkGrid';
import ArrangeActionBar from './components/ArrangeActionBar';
import Launchpad from './components/Launchpad';
import { useToast } from './components/Toast';
import AuthModal from './components/AuthModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import CommandPalette from './components/CommandPalette';
import ContextMenu from './components/ContextMenu';
import ModalErrorBoundary from './components/ModalErrorBoundary';
const ImportModal = React.lazy(() => import('./components/ImportModal'));
const LinkModal = React.lazy(() => import('./components/LinkModal'));
const QRCodeModal = React.lazy(() => import('./components/QRCodeModal'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const SyncConflictModal = React.lazy(() => import('./components/SyncConflictModal'));

/** 首页置顶横条最多显示的条目数，超出时引导去置顶页。 */
const HOME_PIN_LIMIT = 6;
/** 各密度档的卡片估算高度与行间距，用于计算首屏可容纳条数。 */
const CARD_HEIGHTS: Record<Density, number> = { compact: 76, cozy: 92, spacious: 108 };
const DENSITY_GAPS: Record<Density, number> = {
  compact: 8,
  cozy: 12,
  spacious: 16,
};
const DEFAULT_SITE_SETTINGS = { title: 'Cove - 我的导航', navTitle: 'Cove', favicon: '', cardStyle: 'icon' as const, density: 'cozy' as const, wallpaperPreset: 'sonoma' as const, wallpaperDim: 12 };
const CARD_STYLES: ReadonlyArray<CardStyle> = ['icon', 'detailed', 'simple', 'list'];
const DEFAULT_FAVICON = '/icon.svg';

/**
 * 只保留当前版本认识的网站设置字段。
 * 旧版写进 website_config 的 passwordExpiryDays 等字段，读进来后不会再被原样存回云端。
 */
const normalizeSiteSettings = (value: Partial<SiteSettings> = {}): SiteSettings => ({
  title: typeof value.title === 'string' ? value.title : DEFAULT_SITE_SETTINGS.title,
  navTitle: typeof value.navTitle === 'string' ? value.navTitle : DEFAULT_SITE_SETTINGS.navTitle,
  favicon: typeof value.favicon === 'string' ? value.favicon : '',
  cardStyle: CARD_STYLES.includes(value.cardStyle as CardStyle) ? value.cardStyle as CardStyle : DEFAULT_SITE_SETTINGS.cardStyle,
  density: normalizeDensity(value.density),
  wallpaper: typeof value.wallpaper === 'string' ? value.wallpaper : undefined,
  wallpaperPreset: normalizeWallpaperPreset(value.wallpaperPreset),
  wallpaperDim: normalizeWallpaperDim(value.wallpaperDim),
});

type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
const DEFAULT_AI_CONFIG: AIConfig = { provider: 'gemini', baseUrl: '', model: 'gemini-2.5-flash' };

/** 从分享文本里取第一个网址：安卓分享常把链接放在 text 而不是 url 参数里。 */
const extractUrl = (text: string | null) => text?.match(/https?:\/\/\S+/)?.[0] || '';

/**
 * 菜单栏时钟：日期 / 星期 / 时间三段。
 * 独立成组件，每 20 秒只重渲染这一小块，不带动整个 App。
 */
const MenuBarClock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="flex items-center gap-2 text-[12.5px] tabular-nums text-ink-soft">
      <span>{`${now.getMonth() + 1}月${now.getDate()}日`}</span>
      <span className="text-ink-muted">{['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}</span>
      <span className="font-medium text-ink">{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span>
    </span>
  );
};
type ContextState = {
  isOpen: boolean;
  position: { x: number; y: number };
  link: LinkItem | null;
  category: Category | null;
  type: 'link' | 'category';
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

const readAIConfig = (): AIConfig => {
  const saved = readJson<Partial<AIConfig>>(AI_CONFIG_KEY, {});
  return {
    ...DEFAULT_AI_CONFIG,
    provider: saved.provider === 'openai' ? 'openai' : 'gemini',
    baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : '',
    model: typeof saved.model === 'string' && saved.model.trim() ? saved.model : DEFAULT_AI_CONFIG.model,
    hasApiKey: false,
  };
};

const mergeClientAIConfig = (remote: Partial<AIConfig> = {}, local = readAIConfig()): AIConfig => ({
  provider: remote.provider === 'openai' ? 'openai' : local.provider,
  baseUrl: remote.baseUrl !== undefined ? remote.baseUrl : local.baseUrl || '',
  model: remote.model || local.model || 'gemini-2.5-flash',
  hasApiKey: remote.hasApiKey === true,
});

const mergeVisitState = (links: LinkItem[]): LinkItem[] => {
  const local = readJson<{ links?: LinkItem[] }>(LOCAL_STORAGE_KEY, {});
  const byId = new Map((local.links || []).map(link => [link.id, link]));
  return links.map(link => {
    const old = byId.get(link.id);
    if (!old) return link;
    return {
      ...link,
      visitCount: Math.max(link.visitCount || 0, old.visitCount || 0),
      lastVisitedAt: Math.max(link.lastVisitedAt || 0, old.lastVisitedAt || 0) || undefined,
    };
  });
};

const parseStoredData = (value: unknown) => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized = normalizeAppData(raw);
  return { ...normalized, links: mergeVisitState(normalized.links) };
};

const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const App: React.FC = () => {
  const { showToast } = useToast();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // 默认落地置顶页：常用入口一打开就在手边。
  const [selectedCategory, setSelectedCategory] = useState('pinned');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinyinReady, setPinyinReady] = useState(isPinyinReady);
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => normalizeSortConfig(readJson<unknown>(SORT_CONFIG_KEY, null)));
  const [arrangeMode, setArrangeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => readAIConfig());
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => normalizeSiteSettings(readJson<Partial<SiteSettings>>(SITE_SETTINGS_KEY, {})));
  const [authToken, setAuthToken] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const dataVersionRef = useRef(0);
  const syncQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const syncBlockedRef = useRef(false);
  const lastRefreshRef = useRef(0);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>();
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>();
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryManagerEditId, setCategoryManagerEditId] = useState('');
  const [lockedCategory, setLockedCategory] = useState<Category | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>();
  const [aiSettingsCategoryId, setAiSettingsCategoryId] = useState('');
  const [aiSettingsAction, setAiSettingsAction] = useState<'rename' | 'structure' | ''>('');
  const [qrCode, setQrCode] = useState({ isOpen: false, url: '', title: '' });
  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextState>({ isOpen: false, position: { x: 0, y: 0 }, link: null, category: null, type: 'link' });
  const [syncConflict, setSyncConflict] = useState<{ local: { links: LinkItem[]; categories: Category[] }; cloud: { links: LinkItem[]; categories: Category[]; version: number } } | null>(null);
  const [lastBackup, setLastBackup] = useState<{ status: string; at: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const saveLocal = (nextLinks: LinkItem[], nextCategories: Category[], version = dataVersionRef.current) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: nextLinks, categories: nextCategories, version }));
  };

  const applyCloudData = (value: unknown) => {
    const data = parseStoredData(value);
    dataVersionRef.current = data.version;
    setLinks(data.links);
    setCategories(data.categories);
    saveLocal(data.links, data.categories, data.version);
    return data;
  };

  const loadLocal = () => {
    const stored = readJson<Record<string, unknown> | null>(LOCAL_STORAGE_KEY, null);
    if (!stored || !Array.isArray(stored.links)) {
      dataVersionRef.current = 0;
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
      return { links: INITIAL_LINKS, categories: DEFAULT_CATEGORIES, version: 0 };
    }
    const data = parseStoredData(stored);
    dataVersionRef.current = data.version;
    setLinks(data.links);
    setCategories(data.categories);
    return data;
  };

  const syncToCloud = (nextLinks: LinkItem[], nextCategories: Category[]): Promise<boolean> => {
    const run = async () => {
      if (syncBlockedRef.current) return false;
      setSyncStatus('saving');
      try {
        const response = await fetch('/api/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: nextLinks, categories: nextCategories, baseVersion: dataVersionRef.current }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setAuthToken(false);
          setSyncStatus('error');
          return false;
        }
        if (response.status === 409 && result.data) {
          const cloud = parseStoredData(result.data);
          dataVersionRef.current = cloud.version;
          syncBlockedRef.current = true;
          setSyncConflict({ local: { links: nextLinks, categories: nextCategories }, cloud });
          setSyncStatus('conflict');
          return false;
        }
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '同步失败');
        if (typeof result.version === 'number') dataVersionRef.current = result.version;
        setLastBackup({ status: typeof result.backup?.status === 'string' ? result.backup.status : 'unknown', at: Date.now() });
        saveLocal(nextLinks, nextCategories, dataVersionRef.current);
        setSyncStatus('saved');
        window.setTimeout(() => setSyncStatus(current => current === 'saved' ? 'idle' : current), 1800);
        return true;
      } catch (error) {
        console.error('Sync failed', error);
        setSyncStatus('error');
        return false;
      }
    };
    const queued = syncQueueRef.current.then(run, run);
    syncQueueRef.current = queued.then(() => true, () => false);
    return queued;
  };

  const updateData = (nextLinks: LinkItem[], nextCategories: Category[]) => {
    const normalized = parseStoredData({ links: nextLinks, categories: nextCategories, version: dataVersionRef.current });
    setLinks(normalized.links);
    setCategories(normalized.categories);
    saveLocal(normalized.links, normalized.categories);
    if (authToken) void syncToCloud(normalized.links, normalized.categories);
  };

  const loadRemoteData = async (allowLocalMigration = false) => {
    lastRefreshRef.current = Date.now();
    const response = await fetch('/api/storage');
    if (response.status === 401) {
      setAuthToken(false);
      return;
    }
    if (!response.ok) throw new Error(`云端数据读取失败（HTTP ${response.status}）`);
    const payload = await response.json() as Record<string, unknown>;
    const cloud = parseStoredData(payload);
    const initialized = payload.initialized === true;
    const local = readJson<Record<string, unknown> | null>(LOCAL_STORAGE_KEY, null);
    const localData = local && Array.isArray(local.links) ? parseStoredData(local) : null;
    if (allowLocalMigration && !initialized && localData && localData.links.length > 0) {
      syncBlockedRef.current = false;
      dataVersionRef.current = cloud.version;
      setLinks(localData.links);
      setCategories(localData.categories);
      saveLocal(localData.links, localData.categories, cloud.version);
      await syncToCloud(localData.links, localData.categories);
      return;
    }
    applyCloudData(cloud);
  };

  const loadRemoteConfig = async () => {
    const [aiResponse, siteResponse] = await Promise.all([
      fetch('/api/storage?getConfig=ai'),
      fetch('/api/storage?getConfig=website'),
    ]);
    if (aiResponse.ok) {
      const remote = await aiResponse.json();
      const next = mergeClientAIConfig(remote);
      setAiConfig(next);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next));
    }
    if (siteResponse.ok) {
      const remote = await siteResponse.json();
      setSiteSettings(current => normalizeSiteSettings({ ...current, ...remote }));
    }
  };

  useEffect(() => {
    const init = async () => {
      if (localStorage.getItem(THEME_KEY) === 'dark' || (!localStorage.getItem(THEME_KEY) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setDarkMode(true);
        document.documentElement.classList.add('dark');
      }
      const params = new URLSearchParams(window.location.search);
      // add_url / add_title 来自 PWA 分享（见 manifest share_target）
      const addUrl = params.get('add_url') || extractUrl(params.get('add_text'));
      if (addUrl) {
        window.history.replaceState({}, '', window.location.pathname);
        setPrefillLink({ title: params.get('add_title') || '', url: addUrl, categoryId: 'common' });
        setIsLinkModalOpen(true);
      }
      try {
        const response = await fetch('/api/storage?checkAuth=true');
        const auth = response.ok ? await response.json() : { requiresAuth: true, authenticated: false };
        setAuthToken(!!auth.authenticated);
        setRequiresAuth(!!auth.requiresAuth);
        if (auth.requiresAuth && !auth.authenticated) {
          loadLocal();
          return;
        }
        await loadRemoteConfig();
        await loadRemoteData(true);
      } catch (error) {
        console.warn('Cloud load failed, using local data', error);
        loadLocal();
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    const refresh = async () => {
      if (!authToken || Date.now() - lastRefreshRef.current < 30000) return;
      lastRefreshRef.current = Date.now();
      try {
        const response = await fetch('/api/storage');
        if (!response.ok) return;
        const data = parseStoredData(await response.json());
        if (data.version > dataVersionRef.current) applyCloudData(data);
      } catch {
        // A foreground refresh is best effort.
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  }, [authToken]);

  useEffect(() => {
    document.title = siteSettings.title || 'Cove';
    // 清空自定义图标时恢复默认图标，否则旧图标会一直留到刷新
    document.querySelectorAll('link[rel="icon"]').forEach(node => node.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = siteSettings.favicon || DEFAULT_FAVICON;
    document.head.appendChild(link);
  }, [siteSettings.title, siteSettings.favicon]);

  // 壁纸：预设或自定义图片写进 --wallpaper，主题切换时重新应用
  useEffect(() => {
    applyWallpaper(siteSettings, darkMode);
  }, [siteSettings.wallpaper, siteSettings.wallpaperPreset, siteSettings.wallpaperDim, darkMode]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleLogin = async (password: string) => {
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) return false;
      setAuthToken(true);
      await loadRemoteConfig();
      await loadRemoteData(true);
      return true;
    } catch {
      return false;
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => undefined);
    setAuthToken(false);
    setSyncStatus('idle');
    // 登出后不在浏览器里留全量书签：共用电脑时任何人打开 DevTools 都能看到
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    loadLocal();
  };

  const handleCategoryActionAuth = async (password: string) => {
    const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
    if (!response?.ok) return false;
    setAuthToken(true);
    return true;
  };

  /** 用 R2 最新备份覆盖当前数据，走正常同步流程（版本号递增，可再次被备份）。 */
  const restoreFromBackup = async () => {
    const response = await fetch('/api/storage?getBackup=latest').catch(() => null);
    if (!response?.ok) {
      showToast('读取云端备份失败', { type: 'error' });
      return;
    }
    const result = await response.json() as { status: string; data?: unknown };
    if (result.status !== 'found') {
      showToast(result.status === 'missing-binding' ? '服务端未绑定 R2' : '云端还没有备份', { type: 'info' });
      return;
    }
    const backup = parseStoredData(result.data);
    if (!confirm(`将用云端备份（${backup.links.length} 条书签、${backup.categories.length} 个分类）覆盖当前数据，确定吗？`)) return;
    updateData(backup.links, backup.categories);
    setIsSettingsOpen(false);
    showToast('已从云端备份恢复', { type: 'success' });
  };

  const handleSaveAIConfig = async (config: AIConfig, nextSiteSettings?: typeof siteSettings) => {
    const requestedConfig: AIConfig = {
      provider: config.provider === 'openai' ? 'openai' : 'gemini',
      baseUrl: config.baseUrl.trim(),
      model: config.model.trim() || DEFAULT_AI_CONFIG.model,
      hasApiKey: false,
    };
    const sameAI = requestedConfig.provider === aiConfig.provider && requestedConfig.baseUrl === aiConfig.baseUrl && requestedConfig.model === aiConfig.model;
    const normalizedSite = nextSiteSettings ? normalizeSiteSettings(nextSiteSettings) : null;
    const sameSite = !normalizedSite || JSON.stringify(normalizedSite) === JSON.stringify(siteSettings);
    let failed = false;

    // 只把真正改过的部分写回云端：每次点「保存」都写两遍 KV 既浪费额度，也没有意义
    let nextConfig = { ...requestedConfig, hasApiKey: aiConfig.hasApiKey };
    if (authToken && !sameAI) {
      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveConfig: 'ai', config: requestedConfig }),
      }).catch(() => null);
      if (response?.ok) {
        const result = await response.json().catch(() => ({}));
        if (result.config) nextConfig = { ...requestedConfig, ...result.config, hasApiKey: result.config.hasApiKey === true };
      } else {
        failed = true;
      }
    }
    setAiConfig(nextConfig);
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(nextConfig));
    if (normalizedSite && !sameSite) {
      setSiteSettings(normalizedSite);
      localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(normalizedSite));
      if (authToken) {
        const response = await fetch('/api/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ saveConfig: 'website', config: normalizedSite }),
        }).catch(() => null);
        if (!response?.ok) failed = true;
      }
    }
    if (failed) showToast('设置已在本机生效，但同步到云端失败，请稍后重试', { type: 'error' });
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
    const categoryList = [...categories];
    newCategories.forEach(category => { if (!categoryList.some(existing => existing.id === category.id || existing.name === category.name)) categoryList.push(category); });
    updateData([...links, ...newLinks], categoryList);
    setIsImportOpen(false);
    showToast(`成功导入 ${newLinks.length} 个新书签`, { type: 'success' });
  };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  };

  const isCategoryLocked = (categoryId: string): boolean => {
    const category = categories.find(item => item.id === categoryId);
    if (!category) return false;
    if (category.password && !unlockedCategoryIds.has(category.id)) return true;
    return category.parentId ? isCategoryLocked(category.parentId) : false;
  };

  const handleCategoryClick = (category: Category) => {
    if (isCategoryLocked(category.id)) { setLockedCategory(category); return; }
    setSelectedCategory(category.id);
    setSidebarOpen(false);
  };

  /**
   * 统一的弹窗打开入口：同一时刻只允许一个主弹窗，
   * 避免「分类管理」叠在「添加新链接」之上这类互相遮挡。
   */
  const openExclusive = (target: 'link' | 'category' | 'settings' | 'import') => {
    setIsLinkModalOpen(target === 'link');
    setIsCategoryManagerOpen(target === 'category');
    setIsSettingsOpen(target === 'settings');
    setIsImportOpen(target === 'import');
  };

  const handleUpdateCategories = (nextCategories: Category[]) => updateData(links, nextCategories);
  const handleDeleteCategory = (categoryId: string) => {
    if (categoryId === 'common') return;
    if (!confirm('确定删除这个分类吗？其中的书签将移动到常用推荐。')) return;
    const childIds = categories.filter(category => category.parentId === categoryId).map(category => category.id);
    const ids = new Set([categoryId, ...childIds]);
    updateData(links.map(link => ids.has(link.categoryId) ? { ...link, categoryId: 'common' } : link), categories.filter(category => !ids.has(category.id)));
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    // 仅在站点确实启用访问密码时要求登录；纯本地模式下直接落本地，保持一致。
    if (requiresAuth && !authToken) return;
    const url = data.url.match(/^https?:\/\//) ? data.url : `https://${data.url}`;
    const newLink: LinkItem = { ...data, url, id: makeId(), createdAt: Date.now(), order: links.length };
    updateData([...links, newLink], categories);
    setIsLinkModalOpen(false);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!editingLink) return;
    updateData(links.map(link => link.id === editingLink.id ? { ...link, ...data, updatedAt: Date.now() } : link), categories);
    setEditingLink(undefined);
    setIsLinkModalOpen(false);
  };

  const handleDeleteLink = (id: string) => {
    if (confirm('确定删除此链接吗？')) updateData(links.filter(link => link.id !== id), categories);
    setIsLinkModalOpen(false);
  };

  const recordVisit = (id: string) => {
    const next = links.map(link => link.id === id ? { ...link, lastVisitedAt: Date.now(), visitCount: (link.visitCount || 0) + 1 } : link);
    setLinks(next);
    saveLocal(next, categories);
  };

  /**
   * 当前视图可见列表。
   * 必须在 handleDragEnd 之前定义：拖拽写回 order 要基于用户看到的顺序。
   */
  // 用普通函数而非 useMemo：这样 handleDragEnd 里能拿到「当前可见顺序」，
  // 又不受变量定义顺序限制（依赖项在后面才声明）。
  const computeDisplayed = () => {
    const parsed = parseSearchQuery(searchQuery);
    const hasSearch = !!searchQuery.trim();
    let result = links.filter(link => !link.deletedAt && !isCategoryLocked(link.categoryId));
    // 置顶板块已单独渲染同一批卡片，主页主列表排除以免重复
    if (!hasSearch && selectedCategory === 'all') result = result.filter(link => !link.pinned);
    if (hasSearch) result = result.filter(link => matchesFilters(link, parsed, categories) && matchesQuery(link, parsed.text));
    if (selectedCategory === 'pinned') {
      result = result.filter(link => link.pinned);
    } else if (selectedCategory !== 'all') {
      const childIds = categories.filter(category => category.parentId === selectedCategory).map(category => category.id);
      result = result.filter(link => link.categoryId === selectedCategory || childIds.includes(link.categoryId));
    }
    return hasSearch ? sortByRelevance(result, parsed.text || searchQuery) : applySort(result, sortConfig);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = event.over ? String(event.over.id) : '';
    if (!overId) return;

    // 拖到侧栏分类 → 移动书签；这是独立于排序的操作
    if (overId.startsWith('cat:')) {
      const targetId = overId.slice(4);
      const linkId = String(event.active.id);
      const link = links.find(item => item.id === linkId);
      if (!link || link.categoryId === targetId) return;
      const target = categories.find(category => category.id === targetId);
      updateData(
        links.map(item => item.id === linkId ? { ...item, categoryId: targetId, updatedAt: Date.now() } : item),
        categories,
      );
      showToast(`已移动到「${target?.name || targetId}」`, { type: 'success' });
      return;
    }

    if (event.active.id === overId) return;
    if (!canReorder(sortConfig)) {
      showToast('请先切到「手动顺序」再拖拽排序', { type: 'info' });
      return;
    }
    const next = applyReorder(links, computeDisplayed(), String(event.active.id), overId);
    if (next) updateData(next, categories);
  };

  const handleContextMenu = (event: React.MouseEvent, link: LinkItem) => {
    event.preventDefault();
    setContextMenu({ isOpen: true, position: { x: event.clientX, y: event.clientY }, link, category: null, type: 'link' });
  };

  const handleCategoryContextMenu = (event: React.MouseEvent, category: Category) => {
    event.preventDefault();
    setContextMenu({ isOpen: true, position: { x: event.clientX, y: event.clientY }, link: null, category, type: 'category' });
  };

  const closeContextMenu = () => setContextMenu(current => ({ ...current, isOpen: false }));
  const copyLinkToClipboard = () => { if (contextMenu.link) void navigator.clipboard.writeText(contextMenu.link.url); closeContextMenu(); };
  const showQRCode = () => { if (contextMenu.link) setQrCode({ isOpen: true, url: contextMenu.link.url, title: contextMenu.link.title }); closeContextMenu(); };
  const editLinkFromContextMenu = () => { if (contextMenu.link) { setEditingLink(contextMenu.link); setIsLinkModalOpen(true); } closeContextMenu(); };
  const deleteLinkFromContextMenu = () => { if (contextMenu.link) handleDeleteLink(contextMenu.link.id); closeContextMenu(); };
  const togglePinFromContextMenu = () => { if (contextMenu.link) updateData(links.map(link => link.id === contextMenu.link?.id ? { ...link, pinned: !link.pinned } : link), categories); closeContextMenu(); };
  const openCategoryFromContextMenu = () => { if (contextMenu.category) handleCategoryClick(contextMenu.category); closeContextMenu(); };
  const editCategoryFromContextMenu = () => { if (contextMenu.category) { setCategoryManagerEditId(contextMenu.category.id); setIsCategoryManagerOpen(true); } closeContextMenu(); };
  const renameCategoryFromContextMenu = () => { if (contextMenu.category) { setAiSettingsCategoryId(contextMenu.category.id); setAiSettingsAction('rename'); setSettingsInitialTab('ai'); setIsSettingsOpen(true); } closeContextMenu(); };
  const structureCategoryFromContextMenu = () => { if (contextMenu.category) { setAiSettingsCategoryId(contextMenu.category.id); setAiSettingsAction('structure'); setSettingsInitialTab('ai'); setIsSettingsOpen(true); } closeContextMenu(); };
  const deleteCategoryFromContextMenu = () => { if (contextMenu.category) handleDeleteCategory(contextMenu.category.id); closeContextMenu(); };


  // UI 渲染用：缓存在依赖变化时重算，避免每次渲染都跑一遍过滤。
  // 第一次搜索时才加载拼音字典，加载完成后重算一次结果
  useEffect(() => {
    if (!searchQuery.trim() || pinyinReady) return;
    void loadPinyin().then(() => setPinyinReady(true));
  }, [searchQuery, pinyinReady]);
  const displayedLinks = useMemo(computeDisplayed, [links, categories, selectedCategory, searchQuery, unlockedCategoryIds, sortConfig, pinyinReady]);

  const pinnedLinks = useMemo(
    () => applySort(links.filter(link => link.pinned && !isCategoryLocked(link.categoryId)), sortConfig),
    [links, categories, unlockedCategoryIds, sortConfig],
  );

  /**
   * 启动台：按"常用点击"排序。
   * 优先访问次数，其次最近访问；都没访问过时用置顶 + 添加时间兜底，
   * 保证新用户打开也有内容，而不是空 Dock。
   */
  const dockLinks = useMemo(() => {
    const visible = links.filter(link => !link.deletedAt && !isCategoryLocked(link.categoryId));
    return [...visible].sort((a, b) => {
      const byVisit = (b.visitCount || 0) - (a.visitCount || 0);
      if (byVisit !== 0) return byVisit;
      const byRecent = (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0);
      if (byRecent !== 0) return byRecent;
      const byPin = Number(!!b.pinned) - Number(!!a.pinned);
      if (byPin !== 0) return byPin;
      return b.createdAt - a.createdAt;
    });
  }, [links, categories, unlockedCategoryIds]);

  /** 侧栏计数：父分类含其子分类的书签。 */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const visible = links.filter(link => !link.deletedAt && !isCategoryLocked(link.categoryId));
    for (const link of visible) counts[link.categoryId] = (counts[link.categoryId] || 0) + 1;
    for (const category of categories) {
      for (const child of categories.filter(item => item.parentId === category.id)) {
        counts[category.id] = (counts[category.id] || 0) + (counts[child.id] || 0);
      }
    }
    return counts;
  }, [links, categories, unlockedCategoryIds]);
  const visibleTotal = useMemo(() => links.filter(link => !link.deletedAt && !isCategoryLocked(link.categoryId)).length, [links, categories, unlockedCategoryIds]);

  useEffect(() => { localStorage.setItem(SORT_CONFIG_KEY, JSON.stringify(sortConfig)); }, [sortConfig]);

  const changeSort = (next: SortConfig) => setSortConfig(next);
  /** 保存外观类设置：本地立即生效并持久化，登录时同步到云端。 */
  const persistSiteSettings = (patch: Partial<SiteSettings>) => {
    const next = normalizeSiteSettings({ ...siteSettings, ...patch });
    setSiteSettings(next);
    localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(next));
    if (authToken) void fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saveConfig: 'website', config: next }),
    }).catch(() => undefined);
  };

  const changeCardStyle = (style: CardStyle) => persistSiteSettings({ cardStyle: style });
  const changeDensity = (next: Density) => persistSiteSettings({ density: next });
  const density = normalizeDensity(siteSettings.density);

  // 置顶页自适应铺满首屏：按内容区高度、卡片高度与列数算首屏条数，
  // 避免宽屏下方留出大片空白。仅读几何信息，不轮询。
  const [contentRef, contentHeight] = useElementHeight();
  const [gridRef, gridColumns, gridTileHeight] = useGridColumns(`${density}:${siteSettings.cardStyle}`);
  const pinnedFillCount = useMemo(() => computeFillCount(contentHeight, {
    total: pinnedLinks.length,
    // 优先用实测格子高度：图标视图和详情视图的格子高差很多，
    // 写死估算值会让自适应算错行数。
    cardHeight: gridTileHeight || CARD_HEIGHTS[density],
    columns: gridColumns,
    rowGap: DENSITY_GAPS[density],
  }), [contentHeight, pinnedLinks.length, density, gridColumns, gridTileHeight]);

  const exitArrange = () => { setArrangeMode(false); setSelectedIds(new Set()); };
  const toggleArrange = () => { if (arrangeMode) exitArrange(); else setArrangeMode(true); };
  const toggleSelect = (id: string) => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(displayedLinks.map(link => link.id)));
  const clearSelection = () => setSelectedIds(new Set());

  /** 批量改动后统一收尾：写回数据并保持整理模式可用。 */
  const applyBatch = (nextLinks: LinkItem[], message: string) => {
    updateData(nextLinks, categories);
    showToast(message, { type: 'success' });
  };

  const batchMove = (categoryId: string) => {
    const target = categories.find(category => category.id === categoryId);
    applyBatch(
      links.map(link => selectedIds.has(link.id) ? { ...link, categoryId, updatedAt: Date.now() } : link),
      `已移动 ${selectedIds.size} 项到「${target?.name || categoryId}」`,
    );
    clearSelection();
  };

  const batchPin = (pinned: boolean) => {
    applyBatch(
      links.map(link => selectedIds.has(link.id) ? { ...link, pinned, pinnedOrder: pinned ? (link.pinnedOrder ?? Date.now()) : undefined } : link),
      pinned ? `已置顶 ${selectedIds.size} 项` : `已取消置顶 ${selectedIds.size} 项`,
    );
    clearSelection();
  };

  const batchAddTag = (tag: string) => {
    applyBatch(
      links.map(link => selectedIds.has(link.id)
        ? { ...link, tags: Array.from(new Set([...(link.tags || []), tag])), updatedAt: Date.now() }
        : link),
      `已为 ${selectedIds.size} 项添加标签「${tag}」`,
    );
    clearSelection();
  };

  const batchDelete = () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个链接吗？`)) return;
    applyBatch(links.filter(link => !selectedIds.has(link.id)), `已删除 ${selectedIds.size} 项`);
    clearSelection();
  };

  const openLink = (link: LinkItem) => {
    recordVisit(link.id);
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };
  const saveExport = (format: 'json' | 'html') => {
    const data = normalizeAppData({ links, categories });
    if (format === 'html') {
      downloadHtmlFile(generateBookmarkHtml(data.links, data.categories), `cove_${new Date().toISOString().slice(0, 10)}.html`);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cove_latest.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const actions = [
    { id: 'add-link', title: '添加链接', description: '新建一个网站卡片', keywords: ['add', '添加', '链接'], icon: <Plus size={14} />, group: 'action' as const, run: () => { setEditingLink(undefined); setIsLinkModalOpen(true); } },
    { id: 'settings', title: '打开设置', description: '网站、AI、扩展与去重设置', keywords: ['settings', '设置', 'ai'], icon: <Settings size={14} />, group: 'action' as const, run: () => setIsSettingsOpen(true) },
    { id: 'import', title: '导入书签', description: '导入 HTML 或 JSON', keywords: ['import', '导入'], icon: <Upload size={14} />, group: 'action' as const, run: () => setIsImportOpen(true) },
    { id: 'export-json', title: '导出 JSON', description: '导出当前书签数据', keywords: ['export', 'json', '导出'], icon: <Save size={14} />, group: 'action' as const, run: () => saveExport('json') },
    { id: 'export-html', title: '导出 HTML', description: '导出浏览器书签文件', keywords: ['export', 'html', '导出'], icon: <Save size={14} />, group: 'action' as const, run: () => saveExport('html') },
    { id: 'theme', title: darkMode ? '切换到浅色模式' : '切换到深色模式', keywords: ['theme', '主题'], icon: darkMode ? <Sun size={14} /> : <Moon size={14} />, group: 'action' as const, run: toggleTheme },
  ];
  const viewTitle = selectedCategory === 'pinned'
    ? '置顶'
    : selectedCategory === 'all'
      ? (searchQuery ? '搜索结果' : '所有链接')
      : categories.find(category => category.id === selectedCategory)?.name || '链接';

  const cardHandlers = {
    onOpen: openLink,
    onEdit: (link: LinkItem) => { setEditingLink(link); setIsLinkModalOpen(true); },
    onToggleSelect: toggleSelect,
    onContextMenu: handleContextMenu,
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  return <div className="mac-desktop flex h-screen overflow-hidden text-ink">
    {requiresAuth && !authToken && <AuthModal isOpen onLogin={handleLogin} />}
    {(!requiresAuth || authToken) && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <div className="mac-desktop">
    {/* 顶部菜单栏 */}
    <div className="mac-menubar">
      {/* 左侧：应用名 + 菜单项，macOS 的 menubar 是紧凑等距的 */}
      <span className="flex items-center gap-1.5 pr-1">
        <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-accent text-[9px] font-bold text-ink-inverse">{Array.from(siteSettings.navTitle || 'Cove')[0]?.toUpperCase()}</span>
        <span className="font-semibold tracking-tight">{siteSettings.navTitle || 'Cove'}</span>
      </span>
      {[
        { label: '书签', onClick: () => { setSelectedCategory('pinned'); setSidebarOpen(false); } },
        { label: '设置', onClick: () => setIsSettingsOpen(true) },
        { label: '外观', onClick: toggleTheme },
        ...(requiresAuth && authToken ? [{ label: '退出', onClick: () => void handleLogout() }] : []),
      ].map(item => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className="rounded-[5px] px-2 py-[3px] text-[13px] text-ink-soft transition-colors hover:bg-white/30 hover:text-ink dark:hover:bg-white/10"
        >
          {item.label}
        </button>
      ))}

      {/* 右侧：时钟 + 主题切换，用细竖线分隔 */}
      <span className="ml-auto flex items-center gap-2.5">
        <MenuBarClock />
        <span className="h-3 w-px bg-line" />
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-[5px] p-1 text-ink-soft transition-colors hover:bg-white/30 hover:text-ink dark:hover:bg-white/10"
          aria-label="切换主题"
        >
          {darkMode ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </span>
    </div>
    <div className="mac-desktop-body">
    <Sidebar
      navTitle={siteSettings.navTitle}
      categories={categories}
      selectedCategory={selectedCategory}
      counts={categoryCounts}
      totalCount={visibleTotal}
      pinnedCount={pinnedLinks.length}
      density={density}
      open={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      onSelect={id => { setSelectedCategory(id); setSidebarOpen(false); exitArrange(); }}
      onSelectCategory={handleCategoryClick}
      onCategoryContextMenu={handleCategoryContextMenu}
      onCreateCategory={() => openExclusive('category')}
      onOpenSettings={() => openExclusive('settings')}
    />
      <CategoryAuthModal isOpen={!!lockedCategory} category={lockedCategory} onClose={() => setLockedCategory(null)} onUnlock={id => { setUnlockedCategoryIds(current => new Set(current).add(id)); setSelectedCategory(id); setLockedCategory(null); }} />
      <CategoryManagerModal isOpen={isCategoryManagerOpen} onClose={() => { setIsCategoryManagerOpen(false); setCategoryManagerEditId(''); }} categories={categories} onUpdateCategories={handleUpdateCategories} onDeleteCategory={handleDeleteCategory} onVerifyPassword={handleCategoryActionAuth} initialEditId={categoryManagerEditId} />
      {/* 懒加载弹窗只在打开时挂载，各自一个 Suspense：首屏不必等这些 chunk，加载时也不会让整个桌面消失 */}
      {isImportOpen && <ModalErrorBoundary onClose={() => setIsImportOpen(false)}><Suspense fallback={null}><ImportModal isOpen onClose={() => setIsImportOpen(false)} existingLinks={links} categories={categories} onImport={handleImportConfirm} /></Suspense></ModalErrorBoundary>}
      {isSettingsOpen && <Suspense fallback={null}><SettingsModal isOpen onClose={() => { setIsSettingsOpen(false); setSettingsInitialTab(undefined); setAiSettingsCategoryId(''); setAiSettingsAction(''); }} config={aiConfig} siteSettings={siteSettings} onSave={handleSaveAIConfig} links={links} categories={categories} onUpdateLinks={next => updateData(next, categories)} onUpdateCategories={next => updateData(links, next)} onUpdateData={updateData} onEditLink={link => { setIsSettingsOpen(false); setEditingLink(link); setIsLinkModalOpen(true); }} onExportJson={() => saveExport('json')} lastBackup={lastBackup} onOpenImport={() => { setIsSettingsOpen(false); setSettingsInitialTab('backup'); setIsImportOpen(true); }} onRestoreBackup={authToken ? () => void restoreFromBackup() : undefined} initialAICategoryId={aiSettingsCategoryId} initialAIAction={aiSettingsAction || undefined} initialTab={settingsInitialTab} /></Suspense>}
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} links={links} categories={categories} actions={actions} onOpenLink={link => { recordVisit(link.id); window.open(link.url, '_blank', 'noopener,noreferrer'); }} onSelectCategory={id => { setSelectedCategory(id); setIsPaletteOpen(false); }} />
      {syncConflict && <Suspense fallback={null}><SyncConflictModal isOpen onClose={() => { syncBlockedRef.current = false; setSyncConflict(null); setSyncStatus('idle'); }} onUseLocal={() => { if (syncConflict) { syncBlockedRef.current = false; void syncToCloud(syncConflict.local.links, syncConflict.local.categories); setSyncConflict(null); } }} onUseCloud={() => { if (syncConflict) { syncBlockedRef.current = false; applyCloudData(syncConflict.cloud); setSyncConflict(null); setSyncStatus('idle'); } }} onMerge={() => { if (!syncConflict) return; const linkMap = new Map([...syncConflict.cloud.links, ...syncConflict.local.links].map(link => [link.id, link])); const catMap = new Map([...syncConflict.cloud.categories, ...syncConflict.local.categories].map(category => [category.id, category])); syncBlockedRef.current = false; dataVersionRef.current = syncConflict.cloud.version; updateData([...linkMap.values()], [...catMap.values()]); setSyncConflict(null); }} /></Suspense>}
      <main className="material-content flex min-w-0 flex-1 flex-col">
        {/* 桌面模式：搜索并入顶部菜单栏，不再单独占一条工具栏 */}
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <div className="relative w-full max-w-md">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="搜索书签…"
              className="material-sunken w-full rounded-[8px] py-1.5 pl-8 pr-3 text-[13px] text-ink outline-none transition-shadow placeholder:text-ink-muted focus:shadow-[inset_0_0_0_2px_hsl(var(--accent)/0.55)]"
            />
          </div>
          <button
            type="button"
            onClick={() => { setEditingLink(undefined); openExclusive('link'); }}
            className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-ink-inverse shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus size={13} />
            添加
          </button>
        </div>
        <div ref={contentRef} className="scrollbar-slim flex-1 overflow-y-auto px-4 pb-32 pt-6 lg:px-8">
          {pinnedLinks.length > 0 && !searchQuery && selectedCategory === 'all' && (
            <section className="mb-4">
              <div className="mb-3 flex items-center gap-2">
                <Pin size={13} className="fill-accent text-accent" />
                <h2 className="text-[13px] font-semibold tracking-tight text-ink">置顶</h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">{pinnedLinks.length}</span>
                {pinnedLinks.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('pinned')}
                    className="ml-auto text-[12px] text-ink-muted transition-colors hover:text-accent"
                  >
                    查看全部 →
                  </button>
                )}
              </div>
              {/* 首页只放一条紧凑横条，置顶再多也不挤占主列表 */}
                <SortableContext items={pinnedLinks.map(link => link.id)} strategy={rectSortingStrategy}>
                  <BookmarkGrid
                    links={pinnedLinks.slice(0, HOME_PIN_LIMIT)}
                    cardStyle="simple"
                    density={density}
                    selectable={arrangeMode}
                    selectedIds={selectedIds}
                    draggable={canReorder(sortConfig)}
                    {...cardHandlers}
                  />
                </SortableContext>
            </section>
          )}

          <section>
            <BookmarkToolbar
              title={viewTitle}
              count={displayedLinks.length}
              total={displayedLinks.length}
              cardStyle={siteSettings.cardStyle}
              sort={sortConfig}
              arrangeMode={arrangeMode}
              selectedCount={selectedIds.size}
              density={density}
              onDensityChange={changeDensity}
              onCardStyleChange={changeCardStyle}
              onSortChange={changeSort}
              onToggleArrange={toggleArrange}
              onSelectAll={selectAll}
              syncStatus={syncStatus}
              onClearSelection={clearSelection}
            />

            {displayedLinks.length ? (
                <div ref={gridRef}>
                  <SortableContext items={displayedLinks.map(link => link.id)} strategy={rectSortingStrategy}>
                    <BookmarkGrid
                      links={selectedCategory === 'pinned' && !searchQuery && !arrangeMode
                        ? displayedLinks.slice(0, pinnedFillCount)
                        : displayedLinks}
                      cardStyle={siteSettings.cardStyle}
                      density={density}
                      selectable={arrangeMode}
                      selectedIds={selectedIds}
                      draggable={canReorder(sortConfig) && !arrangeMode}
                      {...cardHandlers}
                    />
                  </SortableContext>
                </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
                {searchQuery ? (
                  <p className="text-[13px] text-slate-400">没有匹配的书签</p>
                ) : selectedCategory === 'pinned' ? (
                  <>
                    <p className="text-[13px] text-slate-400">还没有置顶书签</p>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="mt-2 text-[12px] text-blue-600 hover:underline dark:text-blue-400"
                    >
                      去全部链接挑选 →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-slate-400">这个分类还没有书签</p>
                    <button
                      type="button"
                      onClick={() => { setEditingLink(undefined); setIsLinkModalOpen(true); }}
                      className="mt-2 text-[12px] text-blue-600 hover:underline dark:text-blue-400"
                    >
                      添加第一个 →
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
    </div>
      <Launchpad
        links={dockLinks}
        density={density}
        onOpen={openLink}
        onContextMenu={handleContextMenu}
      />
      <ArrangeActionBar
        selectedCount={selectedIds.size}
        categories={categories}
        onMove={batchMove}
        onTogglePin={batchPin}
        onAddTag={batchAddTag}
        onDelete={batchDelete}
        onClear={clearSelection}
      />
      {isLinkModalOpen && <Suspense fallback={null}><LinkModal isOpen onClose={() => { setIsLinkModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }} onSave={editingLink ? handleEditLink : handleAddLink} onDelete={editingLink ? handleDeleteLink : undefined} categories={categories} links={links} initialData={editingLink || (prefillLink as LinkItem)} aiConfig={aiConfig} defaultCategoryId={selectedCategory !== 'all' ? selectedCategory : undefined} /></Suspense>}
      <ContextMenu isOpen={contextMenu.isOpen} position={contextMenu.position} targetType={contextMenu.type} isCategoryEditable={contextMenu.category?.id !== 'common'} onClose={closeContextMenu} onCopyLink={copyLinkToClipboard} onShowQRCode={showQRCode} onEditLink={editLinkFromContextMenu} onDeleteLink={deleteLinkFromContextMenu} onTogglePin={togglePinFromContextMenu} onOpenCategory={openCategoryFromContextMenu} onEditCategory={editCategoryFromContextMenu} onRenameCategory={renameCategoryFromContextMenu} onStructureCategory={structureCategoryFromContextMenu} onDeleteCategory={deleteCategoryFromContextMenu} />
      {qrCode.isOpen && <Suspense fallback={null}><QRCodeModal isOpen url={qrCode.url} title={qrCode.title} onClose={() => setQrCode({ isOpen: false, url: '', title: '' })} /></Suspense>}
    </DndContext>}
  </div>
};

export default App;
