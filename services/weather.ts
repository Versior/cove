/** Open-Meteo 的 WMO 天气代码 → 中文描述与图标类别。 */

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface WeatherNow {
  temperature: number;
  code: number;
  isDay: boolean;
  max: number;
  min: number;
  updatedAt: number;
}

const TABLE: Array<{ codes: number[]; kind: WeatherKind; label: string }> = [
  { codes: [0], kind: 'clear', label: '晴' },
  { codes: [1, 2], kind: 'partly', label: '多云' },
  { codes: [3], kind: 'cloudy', label: '阴' },
  { codes: [45, 48], kind: 'fog', label: '雾' },
  { codes: [51, 53, 55, 56, 57], kind: 'drizzle', label: '毛毛雨' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], kind: 'rain', label: '雨' },
  { codes: [71, 73, 75, 77, 85, 86], kind: 'snow', label: '雪' },
  { codes: [95, 96, 99], kind: 'storm', label: '雷雨' },
];

export const describeWeather = (code: number): { kind: WeatherKind; label: string } => {
  const row = TABLE.find(item => item.codes.includes(code));
  return row ? { kind: row.kind, label: row.label } : { kind: 'cloudy', label: '未知' };
};
