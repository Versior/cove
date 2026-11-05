import React from 'react';
import { Check, Search, Tag, Trash2, X } from 'lucide-react';
import type { LinkItem } from '../types';
import { collectTags, deleteTag, renameTag } from '../services/tags';

interface TagManagerPanelProps {
  links: LinkItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
  /** 在桌面上按标签筛选（关闭设置并填入 tag:xxx）。 */
  onShowTag?: (tag: string) => void;
}

/** 标签管理：重命名（改成已有名字即合并）、删除、跳到桌面查看。 */
const TagManagerPanel: React.FC<TagManagerPanelProps> = ({ links, onUpdateLinks, onShowTag }) => {
  const tags = React.useMemo(() => collectTags(links), [links]);
  const [filter, setFilter] = React.useState('');
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const visible = tags.filter(item => item.tag.toLowerCase().includes(filter.trim().toLowerCase()));

  const commitRename = (from: string) => {
    const to = draft.trim();
    setEditing(null);
    if (!to || to === from) return;
    const existing = tags.find(item => item.tag === to);
    if (existing && !confirm(`「${to}」已经存在，将把「${from}」合并进去，确定吗？`)) return;
    onUpdateLinks(renameTag(links, from, to));
  };

  const remove = (tag: string, count: number) => {
    if (!confirm(`从 ${count} 个书签上移除标签「${tag}」吗？书签本身不会被删除。`)) return;
    onUpdateLinks(deleteTag(links, tag));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Tag size={16} className="text-accent" />标签管理 <span className="text-xs font-normal text-ink-muted">{tags.length} 个</span></div>
        <div className="relative w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="筛选标签" className="w-full rounded-lg border border-line-strong bg-raised py-1.5 pl-8 pr-2 text-xs text-ink outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>
      <p className="text-xs text-ink-muted">重命名为已有的标签名即可合并两个标签。</p>

      {tags.length === 0 ? (
        <p className="rounded-xl border border-line bg-raised px-4 py-6 text-center text-sm text-ink-soft">还没有标签。编辑书签或在整理模式里批量加标签。</p>
      ) : (
        <div className="max-h-[26rem] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-raised">
          {visible.map(({ tag, count }) => (
            <div key={tag} className="flex items-center gap-2 px-3 py-2">
              {editing === tag ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') commitRename(tag); if (event.key === 'Escape') setEditing(null); }}
                    list="cove-tag-names"
                    className="min-w-0 flex-1 rounded-md border border-accent bg-raised px-2 py-1 text-sm text-ink outline-none"
                  />
                  <button type="button" onClick={() => commitRename(tag)} aria-label="保存" className="rounded-md p-1.5 text-accent hover:bg-sunken"><Check size={14} /></button>
                  <button type="button" onClick={() => setEditing(null)} aria-label="取消" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken"><X size={14} /></button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setEditing(tag); setDraft(tag); }} title="点击重命名" className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent">{tag}</button>
                  <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[11px] tabular-nums text-ink-soft">{count}</span>
                  {onShowTag && <button type="button" onClick={() => onShowTag(tag)} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:bg-sunken hover:text-ink">查看</button>}
                  <button type="button" onClick={() => remove(tag, count)} aria-label={`删除标签 ${tag}`} className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-danger"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
          {visible.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-muted">没有匹配的标签</p>}
        </div>
      )}
      <datalist id="cove-tag-names">{tags.map(item => <option key={item.tag} value={item.tag} />)}</datalist>
    </div>
  );
};

export default TagManagerPanel;
