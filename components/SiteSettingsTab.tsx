import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { SiteSettings } from '../types';
import { WALLPAPER_OPTIONS } from '../services/wallpaper';
import { initialOf } from '../services/iconPalette';

/** 随机图标色相：两端相差 30–60°，生成同色系渐变。 */
const randomGradient = (): [string, string] => {
 const h1 = Math.floor(Math.random() * 360);
 const h2 = (h1 + 30 + Math.random() * 30) % 360;
 return [`hsl(${h1}, ${70 + Math.random() * 20}%, ${45 + Math.random() * 15}%)`, `hsl(${h2}, 70%, 50%)`];
};

const escapeXml = (value: string) => value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

/** 用导航栏标题的第一个字生成 SVG 图标，跳过开头的标点和 emoji。 */
const generateSvgIcon = (text: string, [color1, color2]: [string, string]) => {
 const char = escapeXml(initialOf(text, 'C'));
 const gradientId = 'g_' + Math.random().toString(36).slice(2, 11);
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#${gradientId})" rx="16"/><text x="50%" y="50%" dy=".35em" fill="white" font-family="-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-weight="bold" font-size="32" text-anchor="middle">${char}</text></svg>`;
 return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
};
interface SiteSettingsTabProps {
 value: SiteSettings;
 onChange: (key: keyof SiteSettings, value: any) => void;
}

const SiteSettingsTab: React.FC<SiteSettingsTabProps> = ({ value, onChange }) => {
 const [generatedIcons, setGeneratedIcons] = useState<string[]>([]);

 const updateGeneratedIcons = (text: string) => {
 setGeneratedIcons(Array.from({ length: 6 }, () => generateSvgIcon(text, randomGradient())));
 };

 // 导航栏标题改了，候选图标上的字也要跟着变
 useEffect(() => {
 updateGeneratedIcons(value.navTitle);
 }, [value.navTitle]);
 return (
 <div className="space-y-6 animate-in fade-in duration-300">
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-ink mb-1">网页标题 (Title)</label>
 <input
 type="text"
 value={value.title}
 onChange={(e) => onChange('title', e.target.value)}
 className="w-full p-2 rounded-lg border border-line-strong dark:text-white outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-ink mb-1">导航栏标题</label>
 <input
 type="text"
 value={value.navTitle}
 onChange={(e) => onChange('navTitle', e.target.value)}
 className="w-full p-2 rounded-lg border border-line-strong dark:text-white outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-ink mb-1">网站图标 (Favicon URL)</label>
 <div className="flex gap-3 items-center">
 <div className="w-10 h-10 rounded-lg bg-sunken flex items-center justify-center overflow-hidden border border-line">
 {value.favicon ? <img src={value.favicon} alt="当前网站图标" className="w-full h-full object-cover"/> : <Globe size={20} className="text-ink-muted"/>}
 </div>
 <input
 type="text"
 value={value.favicon}
 onChange={(e) => onChange('favicon', e.target.value)}
 placeholder="https://example.com/favicon.ico"
 className="flex-1 p-2 rounded-lg border border-line-strong dark:text-white outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div className="mt-3">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs text-ink-soft">选择生成的随机图标 (点击右侧按钮刷新):</p>
 <button
 type="button"
 onClick={() => updateGeneratedIcons(value.navTitle)}
 className="text-xs flex items-center gap-1 text-accent hover:bg-accent-soft px-2 py-1 rounded transition-colors"
 >
 <RefreshCw size={12} /> 随机生成
 </button>
 </div>
 <div className="flex gap-2">
 {generatedIcons.map((icon, idx) => (
 <button
 key={idx}
 type="button"
 aria-label={`使用第 ${idx + 1} 个随机图标`}
 onClick={() => onChange('favicon', icon)}
 className="w-8 h-8 rounded hover:ring-2 ring-accent transition-all border border-slate-100"
 >
 <img src={icon} alt="" className="w-full h-full rounded" />
 </button>
 ))}
 </div>
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-ink mb-2">壁纸</label>
 <div className="grid grid-cols-5 gap-2">
 {WALLPAPER_OPTIONS.map(option => {
 const active = (value.wallpaperPreset || 'sonoma') === option.id;
 return (
 <button
 key={option.id}
 type="button"
 onClick={() => onChange('wallpaperPreset', option.id)}
 className={`group flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${active ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-sunken'}`}
 >
 <span className="h-10 w-full rounded-md border border-line/60 shadow-sm" style={{ background: option.swatch }} />
 <span className={`text-[11px] ${active ? 'font-medium text-accent-ink' : 'text-ink-soft'}`}>{option.label}</span>
 </button>
 );
 })}
 </div>
 {(value.wallpaperPreset || 'sonoma') === 'custom' && (
 <input
 type="text"
 value={value.wallpaper || ''}
 onChange={(e) => onChange('wallpaper', e.target.value)}
 placeholder="https://example.com/wallpaper.jpg"
 className="mt-2 w-full p-2 rounded-lg border border-line-strong dark:text-white outline-none focus:ring-2 focus:ring-accent"
 />
 )}
 <div className="mt-3">
 <div className="flex items-center justify-between mb-1">
 <span className="text-xs text-ink-soft">壁纸亮度压制</span>
 <span className="text-xs tabular-nums text-ink-muted">{typeof value.wallpaperDim === 'number' ? value.wallpaperDim : 12}%</span>
 </div>
 <input
 type="range"
 min="0"
 max="80"
 step="2"
 value={typeof value.wallpaperDim === 'number' ? value.wallpaperDim : 12}
 onChange={(e) => onChange('wallpaperDim', Number(e.target.value))}
 className="w-full accent-[hsl(var(--accent))]"
 />
 <p className="mt-1 text-xs text-ink-soft">调高会让壁纸更淡，文字更清晰</p>
 </div>
 </div>
 </div>
 </div>
 );
};

export default SiteSettingsTab;
