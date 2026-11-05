import React, { useState, useRef } from 'react';
import { Lock, ArrowRight, X } from 'lucide-react';
import { useModalA11y } from './useModalA11y';
import { Category } from '../types';
import { verifyCategoryPassword } from '../services/categoryLock';

interface CategoryAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
  onUnlock: (categoryId: string) => void;
}

const CategoryAuthModal: React.FC<CategoryAuthModalProps> = ({ isOpen, onClose, category, onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, containerRef);

  if (!isOpen || !category) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyCategoryPassword(category, password)) {
      onUnlock(category.id);
      setPassword('');
      setError('');
      onClose();
    } else {
      setError('密码错误');
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="float-surface relative w-full max-w-sm overflow-hidden p-6">
        <button onClick={onClose} aria-label="关闭" className="absolute right-4 top-4 rounded-full p-1 text-ink-muted hover:bg-sunken">
          <X size={18} />
        </button>

        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warn-soft text-warn">
            <Lock size={26} />
          </div>
          <h2 className="text-lg font-semibold text-ink">解锁「{category.name}」</h2>
          <p className="mt-2 text-center text-sm text-ink-soft">该分类受密码保护，请输入密码访问</p>
          <p className="mt-1 text-center text-[11px] text-ink-muted">这是显示锁，只防同屏窥视，不加密数据本身</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-raised p-3 text-center tracking-widest text-ink outline-none focus:ring-2 focus:ring-accent"
            placeholder="分类密码"
            autoFocus
          />
          {error && <div className="text-center text-sm font-medium text-danger">{error}</div>}
          <button
            type="submit"
            disabled={!password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            解锁 <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default CategoryAuthModal;
