import React from 'react';
import type { Space } from '../types';

interface SpaceSwitcherProps {
  spaces: Space[];
  currentId: string;
  onSwitch: (id: string) => void;
}

/**
 * 菜单栏里的桌面切换器，类似调度中心顶部的桌面条。
 * 只有一个桌面时不渲染；快捷键 Ctrl + ← / → 在 App 里处理。
 */
const SpaceSwitcher: React.FC<SpaceSwitcherProps> = ({ spaces, currentId, onSwitch }) => {
  if (spaces.length < 2) return null;
  return (
    <span className="flex items-center gap-0.5 rounded-[6px] bg-white/25 p-0.5 dark:bg-white/8" role="tablist" aria-label="切换桌面">
      {spaces.map((space, index) => {
        const active = space.id === currentId;
        return (
          <button
            key={space.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSwitch(space.id)}
            title={`${space.name}（Ctrl + ← / → 切换）`}
            className={`max-w-[7rem] truncate rounded-[4px] px-2 py-[1px] text-[12px] transition-colors ${active
              ? 'bg-accent text-ink-inverse shadow-sm'
              : 'text-ink-soft hover:bg-white/40 hover:text-ink dark:hover:bg-white/10'}`}
          >
            {space.name || `桌面 ${index + 1}`}
          </button>
        );
      })}
    </span>
  );
};

export default React.memo(SpaceSwitcher);
