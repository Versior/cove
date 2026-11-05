import type { SiteSettings, WallpaperPreset } from '../types';

/**
 * 壁纸：预设 + 自定义图片。
 *
 * 做法：预设是几组渐变，写到 --wallpaper 变量上；自定义图片则覆盖成 url(...)。
 * 组件不关心具体壁纸，只依赖 body::before 读取 --wallpaper。
 *
 * 之所以做成"预设渐变"而不是内置几张图片：渐变零请求、无版权问题、
 * 且在任何分辨率下都不糊；需要真实照片时用自定义 URL 覆盖即可。
 */

export interface WallpaperOption {
  id: WallpaperPreset;
  label: string;
  /** 用于设置页小色块预览 */
  swatch: string;
}

export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  { id: 'sonoma', label: 'Sonoma', swatch: 'linear-gradient(135deg,#8fb8f0,#b9a6f0 55%,#9ad6ee)' },
  { id: 'ventura', label: 'Ventura', swatch: 'linear-gradient(135deg,#f6b8c8,#c9b6f2 50%,#9fc4f2)' },
  { id: 'monterey', label: 'Monterey', swatch: 'linear-gradient(135deg,#7fd4c8,#8fb0ee 55%,#c4a4ea)' },
  { id: 'graphite', label: '石墨', swatch: 'linear-gradient(135deg,#d8dade,#b9bec6 55%,#9aa1ab)' },
  { id: 'custom', label: '自定义图片', swatch: 'repeating-conic-gradient(#d8d8de 0% 25%,#f0f0f4 0% 50%) 50%/12px 12px' },
];

/** 预设 id → 亮色/暗色两套渐变。 */
const PRESET_GRADIENTS: Record<Exclude<WallpaperPreset, 'custom'>, { light: string; dark: string }> = {
  sonoma: {
    light: `radial-gradient(1100px 760px at 10% 6%, hsl(214 88% 70% / 0.34), transparent 62%),
      radial-gradient(980px 700px at 90% 16%, hsl(268 78% 74% / 0.28), transparent 64%),
      radial-gradient(900px 900px at 68% 94%, hsl(190 84% 68% / 0.24), transparent 62%),
      radial-gradient(760px 580px at 18% 90%, hsl(330 74% 74% / 0.18), transparent 62%),
      linear-gradient(155deg, hsl(220 44% 88%), hsl(248 38% 82%))`,
    dark: `radial-gradient(1100px 760px at 10% 6%, hsl(214 86% 42% / 0.30), transparent 62%),
      radial-gradient(980px 700px at 90% 16%, hsl(268 76% 46% / 0.26), transparent 64%),
      radial-gradient(900px 900px at 68% 94%, hsl(190 82% 40% / 0.22), transparent 62%),
      radial-gradient(760px 580px at 18% 90%, hsl(330 72% 44% / 0.16), transparent 62%),
      linear-gradient(155deg, hsl(228 32% 14%), hsl(240 26% 8%))`,
  },
  ventura: {
    light: `radial-gradient(1100px 780px at 14% 10%, hsl(330 90% 82% / 0.40), transparent 62%),
      radial-gradient(940px 700px at 86% 20%, hsl(270 80% 82% / 0.34), transparent 64%),
      radial-gradient(900px 860px at 60% 96%, hsl(210 88% 78% / 0.30), transparent 62%),
      linear-gradient(160deg, hsl(340 52% 92%), hsl(268 44% 86%))`,
    dark: `radial-gradient(1100px 780px at 14% 10%, hsl(330 60% 40% / 0.30), transparent 62%),
      radial-gradient(940px 700px at 86% 20%, hsl(270 56% 44% / 0.26), transparent 64%),
      radial-gradient(900px 860px at 60% 96%, hsl(210 60% 40% / 0.22), transparent 62%),
      linear-gradient(160deg, hsl(320 24% 13%), hsl(262 22% 9%))`,
  },
  monterey: {
    light: `radial-gradient(1100px 760px at 12% 8%, hsl(174 76% 74% / 0.38), transparent 62%),
      radial-gradient(980px 720px at 88% 22%, hsl(214 84% 76% / 0.32), transparent 64%),
      radial-gradient(860px 860px at 66% 94%, hsl(280 72% 80% / 0.26), transparent 62%),
      linear-gradient(158deg, hsl(186 46% 90%), hsl(226 44% 85%))`,
    dark: `radial-gradient(1100px 760px at 12% 8%, hsl(174 58% 38% / 0.28), transparent 62%),
      radial-gradient(980px 720px at 88% 22%, hsl(214 62% 42% / 0.24), transparent 64%),
      radial-gradient(860px 860px at 66% 94%, hsl(280 50% 42% / 0.20), transparent 62%),
      linear-gradient(158deg, hsl(196 26% 13%), hsl(226 24% 9%))`,
  },
  graphite: {
    light: `radial-gradient(1000px 720px at 16% 10%, hsl(220 14% 88% / 0.9), transparent 62%),
      radial-gradient(900px 680px at 84% 24%, hsl(220 10% 84% / 0.8), transparent 64%),
      linear-gradient(158deg, hsl(220 14% 92%), hsl(220 12% 84%))`,
    dark: `radial-gradient(1000px 720px at 16% 10%, hsl(220 8% 26% / 0.85), transparent 62%),
      radial-gradient(900px 680px at 84% 24%, hsl(220 8% 20% / 0.8), transparent 64%),
      linear-gradient(158deg, hsl(220 8% 15%), hsl(220 8% 9%))`,
  },
};

const normalizeWallpaperPreset = (value: unknown): WallpaperPreset =>
  value === 'ventura' || value === 'monterey' || value === 'graphite' || value === 'custom'
    ? value
    : 'sonoma';

/** 壁纸暗化：0 = 不暗化，100 = 全黑。默认给一点，保证文字清晰。 */
const normalizeWallpaperDim = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.max(0, Math.min(80, Math.round(n)));
};

/**
 * 把当前壁纸写进 CSS 变量。
 *
 * - 预设：写渐变
 * - 自定义：写 url(...)，并额外叠一层暗化渐变，避免亮图把文字冲淡
 */
export const applyWallpaper = (settings: SiteSettings, dark: boolean): void => {
  const root = document.documentElement;
  const preset = normalizeWallpaperPreset(settings.wallpaperPreset);
  const dim = normalizeWallpaperDim(settings.wallpaperDim);
  const dimLayer = dim > 0
    ? `linear-gradient(hsl(${dark ? '240 20% 4%' : '0 0% 100%'} / ${(dim / 100).toFixed(2)}), hsl(${dark ? '240 20% 4%' : '0 0% 100%'} / ${(dim / 100).toFixed(2)}))`
    : '';

  if (preset === 'custom' && settings.wallpaper) {
    const url = `url("${settings.wallpaper.replace(/"/g, '%22')}")`;
    root.style.setProperty('--wallpaper', dimLayer ? `${dimLayer}, ${url}` : url);
    root.style.setProperty('--wallpaper-size', 'cover');
    return;
  }

  const gradients = PRESET_GRADIENTS[preset === 'custom' ? 'sonoma' : preset];
  const base = dark ? gradients.dark : gradients.light;
  root.style.setProperty('--wallpaper', dimLayer ? `${dimLayer}, ${base}` : base);
  root.style.setProperty('--wallpaper-size', 'cover');
};
