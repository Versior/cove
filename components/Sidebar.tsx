import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { LayoutGrid, Lock, Plus, Pin, Settings, X } from 'lucide-react';
import type { Category, Density } from '../types';
import { DENSITY_TOKENS } from '../services/density';
import Icon from './Icon';

interface SidebarProps {
  navTitle: string;
  categories: Category[];
  selectedCategory: string;
  /** 各分类下的书签数（含子分类），用于右侧计数。 */
  counts: Record<string, number>;
  totalCount: number;
  pinnedCount: number;
  /** 全局密度，控制分类行高与图标 */
  density?: Density;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onSelectCategory: (category: Category) => void;
  onCategoryContextMenu: (event: React.MouseEvent, category: Category) => void;
  onCreateCategory: () => void;
  onOpenSettings: () => void;
}

/**
 * macOS 风格文件夹图标：双层梯形，蓝色渐变。
 * 比线性 Folder 图标更像真实的 macOS 文件夹，符合"桌面"观感。
 */
const FolderGlyph: React.FC<{ active?: boolean; size?: number; locked?: boolean }> = ({ active, size = 18, locked }) => {
  const w = size;
  const h = Math.round(size * 0.82);
  return (
    <span className="relative shrink-0" style={{ width: w, height: h }} aria-hidden="true">
      <svg viewBox="0 0 24 20" width={w} height={h} fill="none">
        <defs>
          <linearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={active ? '#5ac8fa' : '#6fb6f5'} />
            <stop offset="100%" stopColor={active ? '#0a84ff' : '#3f8fdd'} />
          </linearGradient>
          <linearGradient id="folderBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={active ? '#7fd4ff' : '#9ccdf8'} />
            <stop offset="100%" stopColor={active ? '#3aa0f0' : '#6ba9e6'} />
          </linearGradient>
        </defs>
        {/* 后层：文件夹背板 */}
        <path d="M2 4.5C2 3.4 2.9 2.5 4 2.5h5.2c.6 0 1.1.3 1.5.8l1 1.4H20c1.1 0 2 .9 2 2v1.3H2V4.5Z" fill="url(#folderBack)" />
        {/* 前层：翻开的那片 */}
        <path d="M2 7.6h20v9.9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V7.6Z" fill="url(#folderFront)" />
        {/* 顶部高光 */}
        <path d="M2 7.6h20v1.6H2z" fill="#fff" opacity="0.28" />
      </svg>
      {locked ? <Lock size={9} className="absolute -bottom-0.5 -right-0.5 text-warn" /> : null}
    </span>
  );
};
/**
 * 图标底座：macOS 侧边栏/系统设置里的圆角方块图标。
 * 让"全部链接""置顶"和文件夹保持同一视觉重量，不会一个线性图标一个实心图标。
 */
const GlyphTile: React.FC<{ active?: boolean; size?: number; tint?: 'blue' | 'amber'; children: React.ReactNode }> = ({
  active, size = 20, tint = 'blue', children,
}) => (
  <span
    className={`grid shrink-0 place-items-center rounded-[6px] transition-colors ${tint === 'amber'
      ? 'bg-gradient-to-b from-amber-400 to-amber-500'
      : 'bg-gradient-to-b from-[#5ac8fa] to-[#0a84ff]'} ${active ? 'shadow-[0_1px_3px_hsl(211_100%_45%/0.35)]' : 'opacity-90'}`}
    style={{ width: size, height: size }}
  >
    {children}
  </span>
);

/** 可接收书签的分类行：拖入时高亮，作为移动目标。 */
const DroppableCategory: React.FC<{
  id: string;
  label: string;
  active: boolean;
  depth: number;
  /** 分类图标；默认的 Folder 显示为蓝色文件夹，其余显示在圆角图标底座上。 */
  icon?: string;
  locked?: boolean;
  countText: string;
  density: Density;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}> = ({ id, label, active, depth, icon, locked, countText, density, onClick, onContextMenu }) => {
  const tokens = DENSITY_TOKENS[density];
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 ${tokens.navItemPadding} ${tokens.navItemText} transition-all ${isOver
        ? 'bg-accent/25 text-accent ring-1 ring-accent/50'
        : active
          ? 'bg-white/50 font-medium text-ink shadow-[inset_0_0_0_0.5px_hsl(0_0%_100%/0.7)] dark:bg-[hsl(240_8%_22%)] dark:shadow-[inset_0_0_0_0.5px_hsl(0_0%_100%/0.12)]'
          : 'text-ink-soft hover:bg-white/30 dark:hover:bg-white/8'}`}
      style={depth ? { paddingLeft: 10 + depth * 14 } : undefined}
      title={`双击打开「${label}」`}
    >
      {/* 默认是 macOS 蓝色文件夹；用户在分类管理里选了别的图标时，用和「全部」「置顶」同款的图标底座 */}
      {icon && icon !== 'Folder' ? (
        <span className="relative shrink-0">
          <GlyphTile active={active || isOver} size={tokens.navIconSize + 5}>
            <Icon name={icon} size={Math.round((tokens.navIconSize + 5) * 0.58)} className="text-white" />
          </GlyphTile>
          {locked ? <Lock size={9} className="absolute -bottom-0.5 -right-0.5 text-warn" /> : null}
        </span>
      ) : (
        <FolderGlyph active={active || isOver} size={tokens.navIconSize + 5} locked={!!locked} />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {locked && <Lock size={11} className="shrink-0 text-warn" />}
      <span className="ml-auto text-[11px] font-normal tabular-nums text-ink-muted">{countText}</span>
    </button>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  navTitle, categories, selectedCategory, counts, totalCount, pinnedCount, density = 'cozy',
  open, onClose, onSelect, onSelectCategory, onCategoryContextMenu, onCreateCategory, onOpenSettings,
}) => {
  const parents = categories.filter(category => !category.parentId);
  const childrenOf = (id: string) => categories.filter(category => category.parentId === id);

  const tokens = DENSITY_TOKENS[density];
  const itemClass = (active: boolean) => `group flex w-full items-center gap-2.5 rounded-lg px-2.5 ${tokens.navItemPadding} ${tokens.navItemText} transition-colors ${active
    ? 'bg-white/50 font-medium text-ink shadow-[inset_0_0_0_0.5px_hsl(0_0%_100%/0.7)] dark:bg-[hsl(240_8%_22%)] dark:shadow-[inset_0_0_0_0.5px_hsl(0_0%_100%/0.12)]'
    : 'text-ink-soft hover:bg-white/30 dark:hover:bg-white/8'}`;

  const renderCategory = (category: Category, depth: number) => (
    <React.Fragment key={category.id}>
      <DroppableCategory
        id={category.id}
        label={category.name}
        active={selectedCategory === category.id}
        depth={depth}
        icon={category.icon}
        locked={!!category.passwordHash}
        countText={counts[category.id] ? String(counts[category.id]) : ''}
        density={density}
        onClick={() => onSelectCategory(category)}
        onContextMenu={event => onCategoryContextMenu(event, category)}
      />
      {childrenOf(category.id).map(child => renderCategory(child, depth + 1))}
    </React.Fragment>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside className={`mac-folderbar fixed inset-y-0 left-0 z-40 flex w-52 shrink-0 transform flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-9 items-center justify-between px-2">
          <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{navTitle || 'Cove'}</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-white/30 lg:hidden" aria-label="关闭导航">
            <X size={14} />
          </button>
        </div>

        <nav className="scrollbar-hide flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-3">
          {/* macOS 侧边栏：全部 / 置顶用系统图标底座，和文件夹保持同一视觉重量 */}
          <button type="button" onClick={() => onSelect('all')} className={itemClass(selectedCategory === 'all')}>
            <GlyphTile active={selectedCategory === 'all'} size={tokens.navIconSize + 5}>
              <LayoutGrid size={Math.round((tokens.navIconSize + 5) * 0.58)} className="text-white" />
            </GlyphTile>
            <span className="min-w-0 flex-1 truncate text-left">全部链接</span>
            <span className="ml-auto text-[11px] tabular-nums text-ink-muted">{totalCount || ''}</span>
          </button>
          <button type="button" onClick={() => onSelect('pinned')} className={itemClass(selectedCategory === 'pinned')}>
            <GlyphTile active={selectedCategory === 'pinned'} size={tokens.navIconSize + 5} tint="amber">
              <Pin size={Math.round((tokens.navIconSize + 5) * 0.58)} className="text-white" />
            </GlyphTile>
            <span className="min-w-0 flex-1 truncate text-left">置顶</span>
            <span className="ml-auto text-[11px] tabular-nums text-ink-muted">{pinnedCount || ''}</span>
          </button>

          <div className="flex items-center justify-between px-3 pb-1 pt-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">分类</span>
            <button type="button" onClick={onCreateCategory} aria-label="新建分类" className="rounded p-0.5 text-ink-muted hover:text-accent">
              <Plus size={13} />
            </button>
          </div>

          {parents.map(category => renderCategory(category, 0))}
          {parents.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-ink-muted">还没有分类</p>
          )}
        </nav>

        <div className="px-1.5 pb-2 pt-2" style={{ boxShadow: 'inset 0 0.5px 0 hsl(var(--line) / 0.7)' }}>
          <button type="button" onClick={onOpenSettings} className={itemClass(false)}>
            <GlyphTile size={tokens.navIconSize + 5} tint="blue">
              <Settings size={Math.round((tokens.navIconSize + 5) * 0.58)} className="text-white" />
            </GlyphTile>
            <span className="min-w-0 flex-1 truncate text-left">设置</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar);
