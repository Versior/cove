import React, { useState, useEffect } from 'react';
import { CloudSun, Globe, Layers, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { SiteSettings, WeatherLocation } from '../types';
import { DEFAULT_ENGINE_ID, SEARCH_ENGINES, BANGS } from '../services/webSearch';
import { DEFAULT_SPACE, makeSpaceId } from '../services/spaces';
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
const sectionTitle = 'mb-2 flex items-center gap-1.5 text-sm font-medium text-ink';
const fieldClass = 'rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent';

/** 天气城市：输入城市名 → 选候选 → 写入设置；清空即关闭菜单栏天气。 */
const WeatherPicker: React.FC<{ value?: WeatherLocation | null; onChange: (value: WeatherLocation | null) => void }> = ({ value, onChange }) => {
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<Array<WeatherLocation & { region: string }>>([]);
 const [status, setStatus] = useState('');

 const search = async () => {
 if (!query.trim()) return;
 setStatus('搜索中…');
 try {
 const response = await fetch(`/api/weather?city=${encodeURIComponent(query.trim())}`);
 const data = await response.json() as { results?: Array<WeatherLocation & { region: string }>; error?: string };
 if (!response.ok) throw new Error(data.error || '搜索失败');
 setResults(data.results || []);
 setStatus(data.results?.length ? '' : '没有找到这个城市');
 } catch (error) {
 setStatus(error instanceof Error ? error.message : '搜索失败');
 }
 };

 return (
 <div>
 <label className={sectionTitle}><CloudSun size={15} />菜单栏天气</label>
 <div className="flex items-center gap-2 text-xs text-ink-soft">
 {value ? <span>当前：<span className="font-medium text-ink">{value.name}</span></span> : <span>未开启</span>}
 {value && <button type="button" onClick={() => onChange(null)} className="text-danger hover:underline">关闭天气</button>}
 </div>
 <div className="mt-2 flex gap-2">
 <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} placeholder="输入城市，如 杭州 / Tokyo" className={`${fieldClass} flex-1`} />
 <button type="button" onClick={() => void search()} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-raised px-3 text-xs font-medium text-ink-soft hover:text-ink"><Search size={13} />搜索</button>
 </div>
 {status && <p className="mt-1 text-xs text-ink-muted">{status}</p>}
 {results.length > 0 && (
 <div className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
 {results.map(item => (
 <button key={`${item.latitude},${item.longitude}`} type="button" onClick={() => { onChange({ name: item.name, latitude: item.latitude, longitude: item.longitude }); setResults([]); setQuery(''); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-sunken">
 <span className="text-ink">{item.name}</span>
 <span className="text-xs text-ink-muted">{item.region}</span>
 </button>
 ))}
 </div>
 )}
 <p className="mt-1 text-xs text-ink-muted">数据来自 Open-Meteo，每 30 分钟刷新。</p>
 </div>
 );
};

interface SiteSettingsTabProps {
 value: SiteSettings;
 onChange: (key: keyof SiteSettings, value: any) => void;
}

const SiteSettingsTab: React.FC<SiteSettingsTabProps> = ({ value, onChange }) => {
 const [generatedIcons, setGeneratedIcons] = useState<string[]>([]);
 const spaces = value.spaces?.length ? value.spaces : [DEFAULT_SPACE];

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

 <div>
 <label className={sectionTitle}><Search size={15} />网页搜索</label>
 <select value={value.searchEngine || DEFAULT_ENGINE_ID} onChange={e => onChange('searchEngine', e.target.value)} className={`${fieldClass} w-full`}>
 {SEARCH_ENGINES.map(engine => <option key={engine.id} value={engine.id}>{engine.name}</option>)}
 </select>
 <p className="mt-1 text-xs leading-relaxed text-ink-soft">
 搜索框里回车：有匹配的书签就打开第一个，没有就用默认引擎搜索；Shift + 回车 总是网页搜索。
 前缀直达：{BANGS.map(item => `!${item.bang} ${item.name}`).join('、')}。
 </p>
 </div>

 <WeatherPicker value={value.weather} onChange={next => onChange('weather', next)} />

 <div>
 <label className={sectionTitle}><Layers size={15} />桌面</label>
 <p className="mb-2 text-xs text-ink-soft">像 macOS 的多个桌面：每个桌面显示各自的分类。分类在「分类管理」里指定所在桌面，菜单栏或 Ctrl + ← / → 切换。</p>
 <div className="space-y-1.5">
 {spaces.map((space, index) => (
 <div key={space.id} className="flex items-center gap-2">
 <span className="w-5 text-right text-xs tabular-nums text-ink-muted">{index + 1}</span>
 <input value={space.name} maxLength={16} onChange={e => onChange('spaces', spaces.map(item => item.id === space.id ? { ...item, name: e.target.value } : item))} className={`${fieldClass} flex-1`} />
 <button
 type="button"
 disabled={spaces.length < 2}
 onClick={() => {
 const rest = spaces.filter(item => item.id !== space.id);
 if (confirm(`删除「${space.name}」？其中的分类会回到「${rest[0].name}」，书签不会丢失。`)) onChange('spaces', rest);
 }}
 aria-label={`删除桌面 ${space.name}`}
 className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-danger disabled:opacity-30"
 >
 <Trash2 size={14} />
 </button>
 </div>
 ))}
 </div>
 {spaces.length < 9 && (
 <button type="button" onClick={() => onChange('spaces', [...spaces, { id: makeSpaceId(), name: `桌面 ${spaces.length + 1}` }])} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink">
 <Plus size={13} />添加桌面
 </button>
 )}
 </div>
 </div>
 </div>
 );
};

export default SiteSettingsTab;
