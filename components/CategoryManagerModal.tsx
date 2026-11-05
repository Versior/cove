import React, { useEffect, useState, useRef } from 'react';
import { useModalA11y } from './useModalA11y';
import { X, ArrowUp, ArrowDown, Trash2, Edit2, Plus, Check, Lock, Palette } from 'lucide-react';
import { Category } from '../types';
import Icon from './Icon';
import IconSelector from './IconSelector';
import { hashCategoryPassword } from '../services/categoryLock';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (newCategories: Category[]) => void;
  /** 删除确认由调用方负责，这里不再重复弹窗。 */
  onDeleteCategory: (id: string) => void;
  /** 从右键菜单「编辑」进入时，直接进入该分类的编辑态。 */
  initialEditId?: string;
}

const inputClass = 'rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent';

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  onDeleteCategory,
  initialEditId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, containerRef);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  /** 新密码：留空表示保持原状。 */
  const [editPassword, setEditPassword] = useState('');
  const [removeLock, setRemoveLock] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newCatPassword, setNewCatPassword] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Folder');

  const [iconSelectorTarget, setIconSelectorTarget] = useState<'edit' | 'new' | null>(null);

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditPassword('');
    setRemoveLock(false);
  };

  useEffect(() => {
    if (!isOpen || !initialEditId) return;
    const target = categories.find(c => c.id === initialEditId);
    if (target && target.id !== 'common') startEdit(target);
  }, [isOpen, initialEditId, categories]);

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newCats = [...categories];
    // 「常用推荐」锁定首位，不参与移动
    if (newCats[index]?.id === 'common') return;
    if (direction === 'up' && index > 0) {
      if (newCats[index - 1]?.id === 'common') return;
      [newCats[index], newCats[index - 1]] = [newCats[index - 1], newCats[index]];
    } else if (direction === 'down' && index < newCats.length - 1) {
      [newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]];
    }
    onUpdateCategories(newCats);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const nextHash = editPassword.trim() ? await hashCategoryPassword(editingId, editPassword.trim()) : undefined;
    onUpdateCategories(categories.map(c => {
      if (c.id !== editingId) return c;
      const passwordHash = removeLock ? undefined : nextHash ?? c.passwordHash;
      return { ...c, name: editName.trim(), icon: editIcon, passwordHash };
    }));
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newCatName.trim()) return;
    const id = crypto.randomUUID?.() || Date.now().toString();
    const newCat: Category = {
      id,
      name: newCatName.trim(),
      icon: newCatIcon,
      passwordHash: newCatPassword.trim() ? await hashCategoryPassword(id, newCatPassword.trim()) : undefined,
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
    setNewCatPassword('');
    setNewCatIcon('Folder');
  };

  const handleIconSelect = (iconName: string) => {
    if (iconSelectorTarget === 'edit') setEditIcon(iconName);
    else if (iconSelectorTarget === 'new') setNewCatIcon(iconName);
    setIconSelectorTarget(null);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-md">
      <div ref={containerRef} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="float-surface flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">分类管理</h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-ink-muted transition-colors hover:bg-sunken hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto px-5 pb-4">
          {categories.map((cat, index) => (
            <div key={cat.id} className="group flex items-start gap-2 rounded-lg bg-sunken p-2.5">
              {/* 排序 */}
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button onClick={() => handleMove(index, 'up')} disabled={index === 0} aria-label="上移分类" className="p-0.5 text-ink-muted hover:text-accent disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => handleMove(index, 'down')} disabled={index === categories.length - 1} aria-label="下移分类" className="p-0.5 text-ink-muted hover:text-accent disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editingId === cat.id && cat.id !== 'common' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Icon name={editIcon} size={16} className="shrink-0 text-ink-soft" />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void saveEdit()}
                        className={`${inputClass} flex-1`}
                        placeholder="分类名称"
                        autoFocus
                      />
                      <button type="button" onClick={() => setIconSelectorTarget('edit')} aria-label="选择图标" title="选择图标" className="p-1 text-ink-muted transition-colors hover:text-accent">
                        <Palette size={16} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Lock size={14} className="shrink-0 text-ink-muted" />
                      <input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        disabled={removeLock}
                        className={`${inputClass} flex-1 disabled:opacity-50`}
                        placeholder={cat.passwordHash ? '输入新密码以修改，留空保持不变' : '设置显示锁密码（可选）'}
                      />
                      {cat.passwordHash && (
                        <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                          <input type="checkbox" checked={removeLock} onChange={(e) => setRemoveLock(e.target.checked)} />
                          移除密码
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <Icon name={cat.icon} size={16} className="shrink-0 text-ink-soft" />
                    <span className="truncate text-sm font-medium text-ink">{cat.name}</span>
                    {cat.id === 'common' && <span className="text-xs text-ink-muted">默认分类，不可编辑</span>}
                    {cat.passwordHash && <Lock size={12} className="shrink-0 text-warn" aria-label="已设置显示锁" />}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {editingId === cat.id ? (
                  <button onClick={() => void saveEdit()} aria-label="保存分类" className="rounded-md bg-raised p-1.5 text-accent shadow-sm ring-1 ring-line">
                    <Check size={15} />
                  </button>
                ) : cat.id === 'common' ? (
                  <span className="p-1.5 text-ink-muted" title="常用推荐分类不能被删除"><Lock size={14} /></span>
                ) : (
                  <>
                    <button onClick={() => startEdit(cat)} aria-label="编辑分类" className="rounded-md p-1.5 text-ink-muted hover:bg-raised hover:text-accent">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => onDeleteCategory(cat.id)} aria-label="删除分类" className="rounded-md p-1.5 text-ink-muted hover:bg-raised hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 px-5 py-3" style={{ boxShadow: 'inset 0 0.5px 0 hsl(var(--line) / 0.8)' }}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">添加新分类</label>
          <div className="flex items-center gap-2">
            <Icon name={newCatIcon} size={16} className="shrink-0 text-ink-soft" />
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
              placeholder="分类名称"
              className={`${inputClass} flex-1`}
            />
            <button type="button" onClick={() => setIconSelectorTarget('new')} aria-label="选择图标" title="选择图标" className="p-1 text-ink-muted transition-colors hover:text-accent">
              <Palette size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="password"
                value={newCatPassword}
                onChange={(e) => setNewCatPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
                placeholder="显示锁密码（可选）"
                className={`${inputClass} w-full pl-8`}
              />
            </div>
            <button
              onClick={() => void handleAdd()}
              disabled={!newCatName.trim()}
              aria-label="添加分类"
              className="flex items-center rounded-lg bg-accent px-3 text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {iconSelectorTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setIconSelectorTarget(null)}>
            <div className="float-surface flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h3 className="text-[15px] font-semibold text-ink">选择图标</h3>
                <button type="button" onClick={() => setIconSelectorTarget(null)} aria-label="关闭" className="rounded-full p-1 text-ink-muted hover:bg-sunken">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <IconSelector onSelectIcon={handleIconSelect} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManagerModal;
