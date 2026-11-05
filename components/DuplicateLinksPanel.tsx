import React, { useMemo, useState } from 'react';
import { CopyCheck, ExternalLink, Trash2, Star, RefreshCw, Check } from 'lucide-react';
import { Category, LinkItem } from '../types';
import { findDuplicateGroups, summarizeDuplicateScan, DuplicateGroup } from '../services/duplicateService';

interface DuplicateLinksPanelProps {
 links: LinkItem[];
 categories: Category[];
 onUpdateLinks: (links: LinkItem[]) => void;
 onEditLink?: (link: LinkItem) => void;
}

const DuplicateLinksPanel: React.FC<DuplicateLinksPanelProps> = ({
 links,
 categories,
 onUpdateLinks,
 onEditLink,
}) => {
 const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
 const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set());
 const [keepIds, setKeepIds] = useState<Record<string, string>>({});

 const categoryName = (id: string) => categories.find(c => c.id === id)?.name || '未分类';

 const summary = useMemo(
 () => (groups ? summarizeDuplicateScan(groups) : null),
 [groups]
 );

 const scan = () => {
 const next = findDuplicateGroups(links);
 const nextKeep: Record<string, string> = {};
 const nextDelete = new Set<string>();

 next.forEach(group => {
 nextKeep[group.key] = group.recommendedKeepId;
 group.members.forEach(member => {
 if (member.link.id !== group.recommendedKeepId) nextDelete.add(member.link.id);
 });
 });

 setGroups(next);
 setKeepIds(nextKeep);
 setDeleteIds(nextDelete);
 };

 const setKeepForGroup = (groupKey: string, keepId: string) => {
 setKeepIds(prev => ({ ...prev, [groupKey]: keepId }));
 setDeleteIds(prev => {
 const next = new Set(prev);
 const group = groups?.find(g => g.key === groupKey);
 if (!group) return next;
 group.members.forEach(member => {
 if (member.link.id === keepId) next.delete(member.link.id);
 else next.add(member.link.id);
 });
 return next;
 });
 };

 const toggleDelete = (groupKey: string, linkId: string) => {
 const keepId = keepIds[groupKey];
 if (linkId === keepId) return;
 setDeleteIds(prev => {
 const next = new Set(prev);
 if (next.has(linkId)) next.delete(linkId);
 else next.add(linkId);
 return next;
 });
 };

 const selectRecommended = () => {
 if (!groups) return;
 const nextKeep: Record<string, string> = {};
 const nextDelete = new Set<string>();
 groups.forEach(group => {
 nextKeep[group.key] = group.recommendedKeepId;
 group.members.forEach(member => {
 if (member.link.id !== group.recommendedKeepId) nextDelete.add(member.link.id);
 });
 });
 setKeepIds(nextKeep);
 setDeleteIds(nextDelete);
 };

 const clearDeleteSelection = () => setDeleteIds(new Set());

 const applyDelete = () => {
 if (deleteIds.size === 0) {
 alert('请先勾选要删除的重复项');
 return;
 }
 if (!confirm(`确定删除 ${deleteIds.size} 个重复书签吗？保留项不会被删除。`)) return;

 const nextLinks = links.filter(link => !deleteIds.has(link.id));
 onUpdateLinks(nextLinks);

 // refresh scan against remaining data
 const refreshed = findDuplicateGroups(nextLinks);
 const nextKeep: Record<string, string> = {};
 const nextDelete = new Set<string>();
 refreshed.forEach(group => {
 nextKeep[group.key] = group.recommendedKeepId;
 group.members.forEach(member => {
 if (member.link.id !== group.recommendedKeepId) nextDelete.add(member.link.id);
 });
 });
 setGroups(refreshed);
 setKeepIds(nextKeep);
 setDeleteIds(nextDelete);
 alert(`已删除 ${deleteIds.size} 个重复书签${refreshed.length ? `，仍剩 ${refreshed.length} 组重复` : ''}`);
 };

 return (
 <div className="space-y-5 animate-in fade-in duration-300">
 <div className="rounded-2xl border border-line bg-canvas p-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex items-center gap-2 text-sm font-semibold text-ink">
 <CopyCheck size={16} className="text-accent" />
 重复网址检测
 </div>
 <p className="mt-1 text-xs text-ink-soft leading-relaxed">
 自动忽略协议、www、末尾斜杠和常见追踪参数。建议保留访问更多、有笔记或描述的那一条。
 </p>
 </div>
 <button
 type="button"
 onClick={scan}
 className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent text-white transition-opacity hover:opacity-90"
 >
 <RefreshCw size={14} />
 {groups ? '重新扫描' : '开始扫描'}
 </button>
 </div>

 {summary && (
 <div className="mt-3 grid grid-cols-3 gap-2 text-center">
 <div className="rounded-xl bg-raised border border-line px-2 py-2">
 <div className="text-lg font-semibold text-ink dark:text-white">{summary.groupCount}</div>
 <div className="text-[11px] text-ink-soft">重复组</div>
 </div>
 <div className="rounded-xl bg-raised border border-line px-2 py-2">
 <div className="text-lg font-semibold text-ink dark:text-white">{summary.duplicateLinks}</div>
 <div className="text-[11px] text-ink-soft">重复书签</div>
 </div>
 <div className="rounded-xl bg-raised border border-line px-2 py-2">
 <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">{deleteIds.size}</div>
 <div className="text-[11px] text-ink-soft">待删除</div>
 </div>
 </div>
 )}
 </div>

 {groups && groups.length === 0 && (
 <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-900/10 px-4 py-8 text-center">
 <Check className="mx-auto mb-2 text-emerald-600 dark:text-emerald-400" size={22} />
 <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">没有发现重复网址</div>
 <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">当前书签库很干净</div>
 </div>
 )}

 {groups && groups.length > 0 && (
 <div className="space-y-3">
 <div className="flex flex-wrap gap-2">
 <button type="button" onClick={selectRecommended} className="px-3 py-1.5 text-xs rounded-lg border border-line bg-raised text-ink-soft">
 按推荐重选
 </button>
 <button type="button" onClick={clearDeleteSelection} className="px-3 py-1.5 text-xs rounded-lg border border-line bg-raised text-ink-soft">
 清空删除勾选
 </button>
 <button
 type="button"
 onClick={applyDelete}
 className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-1"
 >
 <Trash2 size={12} /> 删除勾选项（{deleteIds.size}）
 </button>
 </div>

 <div className="space-y-3 max-h-[28rem] overflow-auto pr-1">
 {groups.map((group, index) => {
 const keepId = keepIds[group.key] || group.recommendedKeepId;
 return (
 <div key={group.key} className="rounded-2xl border border-line bg-raised overflow-hidden">
 <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-2 bg-canvas/80">
 <div className="min-w-0">
 <div className="text-xs font-medium text-ink">
 第 {index + 1} 组 · {group.members.length} 条
 </div>
 <div className="text-[11px] text-ink-muted truncate">{group.displayUrl}</div>
 </div>
 <div className="text-[11px] text-ink-muted shrink-0">key: {group.key.slice(0, 36)}{group.key.length > 36 ? '…' : ''}</div>
 </div>

 <div className="divide-y divide-line">
 {group.members.map(member => {
 const link = member.link;
 const isKeep = link.id === keepId;
 const markedDelete = deleteIds.has(link.id);
 return (
 <div key={link.id} className={`px-3 py-2.5 flex flex-wrap items-start gap-3 ${isKeep ? 'bg-accent-soft/40' : ''}`}>
 <div className="pt-0.5 flex flex-col items-center gap-2">
 <label className="text-[10px] text-ink-muted flex flex-col items-center gap-1">
 保留
 <input
 type="radio"
 name={`keep-${group.key}`}
 checked={isKeep}
 onChange={() => setKeepForGroup(group.key, link.id)}
 />
 </label>
 <label className={`text-[10px] flex flex-col items-center gap-1 ${isKeep ? 'text-ink-soft' : 'text-red-500'}`}>
 删除
 <input
 type="checkbox"
 disabled={isKeep}
 checked={!isKeep && markedDelete}
 onChange={() => toggleDelete(group.key, link.id)}
 />
 </label>
 </div>

 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <div className="font-medium text-sm text-ink truncate">{link.title}</div>
 {member.isRecommendedKeep && (
 <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
 <Star size={10} /> 推荐保留
 </span>
 )}
 {isKeep && (
 <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-accent-ink">
 当前保留
 </span>
 )}
 </div>
 <div className="text-xs text-ink-muted truncate mt-0.5">{link.url}</div>
 <div className="text-[11px] text-ink-soft mt-1 flex flex-wrap gap-x-3 gap-y-1">
 <span>分类：{categoryName(link.categoryId)}</span>
 <span>访问：{link.visitCount || 0}</span>
 {link.pinned && <span>已置顶</span>}
 {link.note?.trim() && <span>有笔记</span>}
 </div>
 </div>

 <div className="flex items-center gap-1 shrink-0">
 <a
 href={link.url}
 target="_blank"
 rel="noreferrer"
 className="p-1.5 rounded-lg hover:bg-sunken text-ink-soft"
 title="打开"
 >
 <ExternalLink size={14} />
 </a>
 {onEditLink && (
 <button
 type="button"
 onClick={() => onEditLink(link)}
 className="px-2 py-1 text-[11px] rounded-lg border border-line text-ink-soft hover:bg-canvas"
 >
 编辑
 </button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
};

export default DuplicateLinksPanel;
