import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feather, Loader2 } from 'lucide-react';
import type { LinkItem } from '../types';
import { faviconProxyUrl, probe } from '../services/favicon';

interface IconSlimPanelProps {
  links: LinkItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

/**
 * 可以交给图标代理的旧图标：
 * - data: URL：旧版导入时把浏览器书签里的 base64 图标原样存下，每条 1–3 KB，每次同步都整包上传
 * - Google 图标服务：国内经常加载失败
 */
const isReplaceable = (icon?: string) => !!icon && (/^data:/i.test(icon) || /gstatic\.|google\.com\/s2\/favicons|faviconextractor/i.test(icon));

const originOf = (url: string) => {
  try { return new URL(url).origin; } catch { return ''; }
};

const formatKB = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/**
 * 图标瘦身：只清理代理确实能取到图标的条目。
 * 代理取不到的保留原图标，不会让任何书签从真图标退化成首字母。
 */
const IconSlimPanel: React.FC<IconSlimPanelProps> = ({ links, onUpdateLinks }) => {
  const targets = useMemo(() => links.filter(link => isReplaceable(link.icon) && originOf(link.url)), [links]);
  const totalBytes = useMemo(() => targets.reduce((sum, link) => sum + (link.icon?.length || 0), 0), [targets]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ clearIds: Set<string>; keep: number } | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const scan = async () => {
    const origins = Array.from(new Set(targets.map(link => originOf(link.url))));
    const reachable = new Set<string>();
    setResult(null);
    setProgress({ done: 0, total: origins.length });
    let done = 0;
    // probe 自带全局并发闸门，这里全部发出即可
    await Promise.all(origins.map(async origin => {
      if (!aliveRef.current) return;
      if (await probe(faviconProxyUrl(origin))) reachable.add(origin);
      done += 1;
      if (aliveRef.current) setProgress({ done, total: origins.length });
    }));
    if (!aliveRef.current) return;
    const clearIds = new Set(targets.filter(link => reachable.has(originOf(link.url))).map(link => link.id));
    setResult({ clearIds, keep: targets.length - clearIds.size });
    setProgress(null);
  };

  const apply = () => {
    if (!result?.clearIds.size) return;
    onUpdateLinks(links.map(link => {
      if (!result.clearIds.has(link.id) || !isReplaceable(link.icon)) return link;
      const { icon: _replaced, ...rest } = link;
      return rest;
    }));
    setResult(null);
  };

  const clearBytes = result ? targets.filter(link => result.clearIds.has(link.id)).reduce((sum, link) => sum + (link.icon?.length || 0), 0) : 0;

  return (
    <section className="rounded-xl border border-line bg-sunken p-4">
      <div className="flex items-start gap-3">
        <Feather size={20} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <h4 className="font-semibold text-ink">图标瘦身</h4>
          <p className="text-ink-soft">
            {targets.length
              ? `${targets.length} 条书签带着内嵌或 Google 图标，共 ${formatKB(totalBytes)}，每次保存都要整包上传。`
              : '没有需要瘦身的图标，所有书签都走图标代理。'}
          </p>
          {targets.length > 0 && (
            <p className="text-xs text-ink-muted">先逐个检测图标代理能否取到图，只清理能取到的；取不到的继续用原图标。</p>
          )}

          {progress && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                <Loader2 size={12} className="animate-spin" />正在检测 {progress.done}/{progress.total} 个站点
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {result && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              可清理 {result.clearIds.size} 条（约 {formatKB(clearBytes)}），保留 {result.keep} 条代理取不到图标的。
            </p>
          )}

          {targets.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => void scan()}
                disabled={!!progress}
                className="rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
              >
                {result ? '重新检测' : '开始检测'}
              </button>
              {result && result.clearIds.size > 0 && (
                <button onClick={apply} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-inverse transition-opacity hover:opacity-90">
                  清理 {result.clearIds.size} 条
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default IconSlimPanel;
