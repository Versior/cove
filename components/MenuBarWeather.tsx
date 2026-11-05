import React from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { WeatherLocation } from '../types';
import { describeWeather, type WeatherKind, type WeatherNow } from '../services/weather';

const REFRESH_MS = 30 * 60 * 1000;

const ICONS: Record<WeatherKind, { day: LucideIcon; night: LucideIcon }> = {
  clear: { day: Sun, night: Moon },
  partly: { day: CloudSun, night: CloudMoon },
  cloudy: { day: Cloud, night: Cloud },
  fog: { day: CloudFog, night: CloudFog },
  drizzle: { day: CloudDrizzle, night: CloudDrizzle },
  rain: { day: CloudRain, night: CloudRain },
  snow: { day: CloudSnow, night: CloudSnow },
  storm: { day: CloudLightning, night: CloudLightning },
};

/**
 * 菜单栏天气：图标 + 当前温度，悬停看城市、天气和今日温度区间。
 * 数据走 /api/weather（边缘缓存 15 分钟），这里每 30 分钟刷新一次；取不到就不显示，不打扰。
 */
const MenuBarWeather: React.FC<{ location?: WeatherLocation | null }> = ({ location }) => {
  const [weather, setWeather] = React.useState<WeatherNow | null>(null);
  const lat = location?.latitude;
  const lon = location?.longitude;

  React.useEffect(() => {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      setWeather(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        if (!response.ok) return;
        const data = await response.json() as WeatherNow;
        if (alive && Number.isFinite(data.temperature)) setWeather(data);
      } catch {
        // 天气只是锦上添花，失败时保持上一次结果
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [lat, lon]);

  if (!location || !weather) return null;
  const { kind, label } = describeWeather(weather.code);
  const Icon = ICONS[kind][weather.isDay ? 'day' : 'night'];
  const range = Number.isFinite(weather.min) && Number.isFinite(weather.max) ? ` · ${Math.round(weather.min)}°~${Math.round(weather.max)}°` : '';

  return (
    <span className="flex items-center gap-1 text-[12.5px] tabular-nums text-ink-soft" title={`${location.name} · ${label}${range}`}>
      <Icon size={13} />
      <span>{Math.round(weather.temperature)}°</span>
    </span>
  );
};

export default React.memo(MenuBarWeather);
