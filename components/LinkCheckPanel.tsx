import React from 'react';
import { Archive, ExternalLink, Loader2, PauseCircle, Pencil, Trash2, Unplug } from 'lucide-react';
import type { Category, LinkItem } from '../types';
import { classifyLink, probeAll, waybackUrl, type LinkHealth, type ProbeResult } from '../services/linkStatus';

interface LinkCheckPanelProps {
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
  onEditLink?: (link: LinkItem) => void;
}

type Row = { link: LinkItem; health: LinkHealth; result: ProbeResult };

const describe = (result: ProbeResult) => {
  if (result.error === 'network') return '无法连接（域名失效或服务器离线）';
  if (result.error === 'timeout') return '响应超时';
  if (result.error === 'blocked') return '内网地址或跳转过多，无法从云端探测';
  if (result.status === 404) return '页面不存在（404）';
  if (result.status === 410) return '页面已删除（410）';
  return `HTTP ${result.status}`;
};

/**
 * 按需检测失效链接：由用户点击触发，不做定时任务、不写入书签数据。
 * 只把「确定打不开」的列为失效；需要登录、反爬或临时故障的单列为「不确定」，避免误删。
 */
const LinkCheckPanel: React.FC<LinkCheckPanelProps> = ({ links, categories, onUpdateLinks, onEditLink }) => {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const stopRef = React.useRef(false);
  React.useEffect(() => () => { stopRef.current = true; }, []);

  const categoryName = (id: string) => categories.find(category => category.id === id)?.name || '未分类';
  const targets = links.filter(link => !link.deletedAt && /^https?:\/\//i.test(link.url));

  const run = async () => {
    stopRef.current = false;
    const urls = Array.from(new Set(targets.map(link => link.url)));
    setRows(null);
    setSelected(new Set());
    setProgress({ done: 0, total: urls.length });
    let done = 0;
    const results = await probeAll(urls, {
      concurrency: 2,
      shouldStop: () => stopRef.current,
      onBatch: batch => { done += batch.length; setProgress({ done, total: urls.length }); },
    });
    const byUrl = new Map(results.map(result => [result.url, result]));
    const next = targets
      .map(link => ({ link, result: byUrl.get(link.url) }))
      .filter((row): row is { link: LinkItem; result: ProbeResult } => !!row.result)
      .map(row => ({ ...row, health: classifyLink(row.result) }))
      .filter(row => row.health === 'broken' || row.health === 'uncertain');
    setRows(next);
    setSelected(new Set(next.filter(row => row.health === 'broken').map(row => row.link.id)));
    setProgress(null);
  };

  const removeSelected = () => {
    if (!selected.size || !confirm(`确定删除选中的 ${selected.size} 个书签吗？`)) return;
    onUpdateLinks(links.filter(link => !selected.has(link.id)));
    setRows(current => current?.filter(row => !selected.has(row.link.id)) || null);
    setSelected(new Set());
  };

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const broken = rows?.filter(row => row.health === 'broken') || [];
  const uncertain = rows?.filter(row => row.health === 'uncertain') || [];

  const renderRow = (row: Row) => (
    <div key={row.link.id} className="flex items-start gap-2.5 px-3 py-2">
      <input type="checkbox" className="mt-1" checked={selected.has(row.link.id)} onChange={() => toggle(row.link.id)} aria-label={`选择 ${row.link.title}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.link.title}</div>
        <div className="truncate text-xs text-ink-muted">{row.link.url}</div>
        <div className={`mt-0.5 text-[11px] ${row.health === 'broken' ? 'text-danger' : 'text-warn'}`}>
          {describe(row.result)} · {categoryName(row.link.categoryId)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <a href={row.link.url} target="_blank" rel="noreferrer" title="打开" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-ink"><ExternalLink size={14} /></a>
        <a href={waybackUrl(row.link.url)} target="_blank" rel="noreferrer" title="在 Internet Archive 查看历史存档" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-ink"><Archive size={14} /></a>
        {onEditLink && <button type="button" onClick={() => onEditLink(row.link)} title="编辑" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-ink"><Pencil size={14} /></button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-sunken p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Unplug size={16} className="text-accent" />失效链接检测</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">由 Cloudflare 边缘逐个访问 {targets.length} 条书签。只有连不上、404、410 会判为失效；需要登录或拦截爬虫的站点单列为「不确定」。</p>
          </div>
          {progress ? (
            <button type="button" onClick={() => { stopRef.current = true; }} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-xs font-medium text-danger">
              <PauseCircle size={13} />停止
            </button>
          ) : (
            <button type="button" onClick={() => void run()} disabled={!targets.length} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-40">
              {rows ? '重新检测' : '开始检测'}
            </button>
          )}
        </div>
        {progress && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-soft"><Loader2 size={12} className="animate-spin" />已检测 {progress.done}/{progress.total}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-line bg-raised px-4 py-6 text-center text-sm text-ink-soft">没有发现失效链接 🎉</p>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">失效 {broken.length} · 不确定 {uncertain.length} · 已选 {selected.size}</span>
            <button type="button" onClick={removeSelected} disabled={!selected.size} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
              <Trash2 size={12} />删除选中
            </button>
          </div>
          {broken.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised">
              <div className="bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">失效（默认已勾选）</div>
              {broken.map(renderRow)}
            </div>
          )}
          {uncertain.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised">
              <div className="bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn">不确定（建议手动打开确认）</div>
              {uncertain.map(renderRow)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LinkCheckPanel;
