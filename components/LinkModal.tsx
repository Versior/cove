import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useModalA11y } from './useModalA11y';
import { X, Sparkles, Loader2, Pin, Wand2, Trash2, AlertTriangle } from 'lucide-react';
import { LinkItem, Category, AIConfig } from '../types';
import { generateLinkDescription, suggestCategory } from '../services/geminiService';
import { findDuplicatesOfUrl } from '../services/duplicateService';
import { faviconProxyUrl } from '../services/favicon';

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
  categories: Category[];
  links?: LinkItem[];
  /** 编辑已有书签时传入；新增时不传。 */
  initialData?: LinkItem;
  /** 新增时的预填内容（PWA 分享、书签小工具），不会让弹窗进入编辑态。 */
  prefill?: Partial<LinkItem>;
  aiConfig: AIConfig;
  defaultCategoryId?: string;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSave, onDelete, categories, links = [], initialData, prefill, aiConfig, defaultCategoryId }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'common');
  const [pinned, setPinned] = useState(false);
  const [icon, setIcon] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingIcon, setIsFetchingIcon] = useState(false);
  const [autoFetchIcon, setAutoFetchIcon] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [monitor, setMonitor] = useState(false);

  const duplicateHits = useMemo(
    () => (url.trim() ? findDuplicatesOfUrl(url, links, initialData?.id) : []),
    [url, links, initialData?.id]
  );

  // 当模态框关闭时，重置批量模式为默认关闭状态
  useEffect(() => {
    if (!isOpen) {
      setBatchMode(false);
      setShowSuccessMessage(false);
    }
  }, [isOpen]);
  
  // 成功提示1秒后自动消失
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setUrl(initialData.url);
        setDescription(initialData.description || '');
        setCategoryId(initialData.categoryId);
        setPinned(initialData.pinned || false);
        setIcon(initialData.icon || '');
        setTagsInput(initialData.tags?.join(', ') || '');
        setNote(initialData.note || '');
        setMonitor(!!initialData.monitor);
      } else {
        setTitle(prefill?.title || '');
        setUrl(prefill?.url || '');
        setDescription('');
        // 预填分类 > 当前所在分类 > 第一个分类
        const preferred = [prefill?.categoryId, defaultCategoryId].find(id => id && categories.some(cat => cat.id === id));
        setCategoryId(preferred || categories[0]?.id || 'common');
        setPinned(false);
        setIcon('');
        setTagsInput('');
        setNote('');
        setMonitor(false);
      }
    }
  }, [isOpen, initialData, prefill, categories, defaultCategoryId]);

  // 当URL变化时:自动获取图标 +(标题为空时)自动抓取网页标题
  useEffect(() => {
    if (!url || initialData) return;
    // 只对合法域名触发，避免用户敲到一半就发请求
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let host = '';
    try { host = new URL(normalized).hostname; } catch { return; }
    if (!host.includes('.')) return;

    const timer = setTimeout(async () => {
      if (autoFetchIcon) void handleFetchIcon();
      // 标题只在为空时自动填，避免覆盖用户已输入的内容
      if (!title.trim()) {
        try {
          const res = await fetch(`/api/fetchtitle?url=${encodeURIComponent(normalized)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.title) setTitle(String(data.title).slice(0, 120));
          }
        } catch { /* 抓不到就保持空，用户可以手填 */ }
      }
    }, 600);

    return () => clearTimeout(timer);
    // title 故意不放进依赖：否则用户每敲一个字都会重新触发抓取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, autoFetchIcon, initialData]);

  const handleDelete = () => {
    if (!initialData) return;
    onDelete && onDelete(initialData.id);
    onClose();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // 必填校验交给 input 的 required（浏览器会定位到具体字段），
    // 这里只做兜底，返回值用 trim 判空避免纯空格通过。
    if (!title.trim() || !url.trim()) return;

    // 确保URL有协议前缀
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      finalUrl = 'https://' + url;
    }

    const duplicates = findDuplicatesOfUrl(finalUrl, links, initialData?.id);
    if (duplicates.length > 0) {
      const names = duplicates.slice(0, 3).map(d => d.title).join('、');
      const more = duplicates.length > 3 ? ` 等 ${duplicates.length} 条` : '';
      if (!confirm(`检测到可能重复的网址：${names}${more}。\n仍要${initialData ? '保存' : '添加'}吗？`)) return;
    }

    // 计算标签
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    // 保存链接数据
    onSave({
      title,
      url: finalUrl,
      icon,
      description,
      categoryId,
      pinned,
      tags,
      note: note.trim() || undefined,
      monitor: monitor || undefined,
    });


    // 批量模式下不关闭窗口，只显示成功提示
    if (batchMode) {
      setShowSuccessMessage(true);
      // 重置表单，但保留分类和批量模式设置
      setTitle('');
      setUrl('');
      setIcon('');
      setDescription('');
      setTagsInput('');
      setNote('');
      setMonitor(false);
      setPinned(false);
      // 如果开启自动获取图标，尝试获取新图标
      if (autoFetchIcon && finalUrl) {
        handleFetchIcon();
      }
    } else {
      onClose();
    }
  };

  const handleAIAssist = async () => {
    if (!url || !title) return;
    if (!aiConfig.hasApiKey) {
      alert('当前部署尚未配置 AI Secret，请联系管理员配置对应 Cloudflare Secret');
      return;
    }

    setIsGenerating(true);
    
    // Parallel execution for speed
    try {
        const descPromise = generateLinkDescription(title, url, aiConfig);
        const catPromise = suggestCategory(title, url, categories, aiConfig);
        
        const [desc, cat] = await Promise.all([descPromise, catPromise]);
        
        if (desc?.trim()) setDescription(desc);
        if (cat && categories.some(c => c.id === cat)) setCategoryId(cat);
        
    } catch (e) {
        console.error("AI Assist failed", e);
        const message = e instanceof Error ? e.message : '请检查 API 配置';
        alert(`AI 调用失败：${message}`);
    } finally {
        setIsGenerating(false);
    }
  };

  /** 图标与卡片、Dock 一致，统一走同源的边缘代理；地址可由 URL 直接推导，无需缓存。 */
  const handleFetchIcon = () => {
    if (!url) return;
    setIsFetchingIcon(true);
    try {
      const { origin } = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      setIcon(faviconProxyUrl(origin));
    } catch {
      alert("无法获取图标，请检查URL是否正确");
    } finally {
      setIsFetchingIcon(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} role="dialog" aria-modal="true" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold dark:text-white">
              {initialData ? '编辑链接' : '添加新链接'}
            </h3>
            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-all ${
                pinned 
                ? 'bg-blue-100 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' 
                : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400'
              }`}
              title={pinned ? "取消置顶" : "置顶"}
            >
              <Pin size={14} className={pinned ? "fill-current" : ""} />
              <span className="text-xs font-medium">置顶</span>
            </button>
            {!initialData && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md border bg-slate-50 border-slate-200 dark:bg-slate-700 dark:border-slate-600">
                <input
                  type="checkbox"
                  id="batchMode"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-slate-300 rounded dark:border-slate-600 dark:bg-slate-700"
                />
                <label htmlFor="batchMode" className="text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer">
                  批量添加不关窗口
                </label>
              </div>
            )}
            {initialData && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-all ${
                  'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400 dark:hover:bg-red-900/30'
                }`}
                title="删除链接"
              >
                <Trash2 size={14} />
                <span className="text-xs font-medium">删除</span>
              </button>
            )}
          </div>
          <button onClick={onClose} aria-label="关闭" className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">标题</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="网站名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">URL 链接</label>
            <div className="flex gap-2">
                <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="example.com 或 https://..."
                />
            </div>
            {duplicateHits.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium">检测到 {duplicateHits.length} 条可能重复的网址</div>
                  <div className="truncate mt-0.5 opacity-90">
                    {duplicateHits.slice(0, 3).map(d => d.title).join('、')}
                    {duplicateHits.length > 3 ? ` 等` : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">图标 URL</label>
            <div className="flex gap-2">
              {icon && (
                <div className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden flex-shrink-0 bg-white dark:bg-slate-700">
                  <img
                    src={icon}
                    alt="图标预览"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="https://example.com/icon.png"
              />
              <button
                type="button"
                onClick={handleFetchIcon}
                disabled={!url || isFetchingIcon}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-1 transition-colors"
              >
                {isFetchingIcon ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                获取图标
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="autoFetchIcon"
                checked={autoFetchIcon}
                onChange={(e) => setAutoFetchIcon(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded dark:border-slate-600 dark:bg-slate-700"
              />
              <label htmlFor="autoFetchIcon" className="text-sm text-slate-700 dark:text-slate-300">
                自动获取URL链接的图标
              </label>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium dark:text-slate-300">描述 (选填)</label>
                {(title && url) && (
                    <button
                        type="button"
                        onClick={handleAIAssist}
                        disabled={isGenerating}
                        className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                    >
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        AI 自动填写
                    </button>
                )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-20 resize-none"
              placeholder="简短描述..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">备注 (选填)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-16 resize-y"
              placeholder="用途、登录方式、待办……可被搜索，悬停卡片时显示"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">标签 (逗号分隔)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="AI, 开发, 工具"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">分类</label>
            <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
            {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
            </select>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={monitor}
              onChange={(e) => setMonitor(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <span>
              在卡片上显示在线状态
              <span className="block text-xs text-slate-400">适合自建服务：每分钟从 Cloudflare 边缘探测一次，内网地址无法探测</span>
            </span>
          </label>

          <div className="pt-2 relative">
            {/* 成功提示 */}
            {showSuccessMessage && (
              <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 z-10 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg transition-opacity duration-300">
                添加成功
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkModal;
