import React, { useEffect, useRef, useState } from 'react';
import { Check, FolderPlus, FolderTree, PauseCircle, Sparkles, Type } from 'lucide-react';
import { AIConfig, Category, LinkItem } from '../types';
import { generateLinkDescription, suggestCategory, suggestFolderRename, suggestFolderStructure, testAIConnection } from '../services/geminiService';
import { normalizeOpenAIEndpoint } from '../services/openaiEndpoint';

interface AISettingsTabProps {
  config: AIConfig;
  onChange: (key: keyof AIConfig, value: string) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
  onUpdateCategories?: (categories: Category[]) => void;
  onUpdateData?: (links: LinkItem[], categories: Category[]) => void;
  initialCategoryId?: string;
  initialAIAction?: 'rename' | 'structure';
}

type Scope = 'all' | 'category';

const AI_PRESETS = [
  { id: 'gemini', label: 'Gemini', provider: 'gemini' as const, baseUrl: '', model: 'gemini-2.5-flash', hint: 'GEMINI_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', provider: 'openai' as const, baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', hint: 'OPENAI_API_KEY' },
  { id: 'openai', label: 'OpenAI', provider: 'openai' as const, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: 'OPENAI_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openai' as const, baseUrl: 'https://openrouter.ai', model: 'openai/gpt-4o-mini', hint: 'OPENAI_API_KEY' },
];
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

/** 分区外壳，统一标题与说明的视觉层级。 */
const Section: React.FC<{ title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, desc, children, action }) => (
  <section className="rounded-xl border border-line bg-raised p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        {desc && <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const AISettingsTab: React.FC<AISettingsTabProps> = ({ config, onChange, links, categories, onUpdateLinks, onUpdateCategories, onUpdateData, initialCategoryId, initialAIAction }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [label, setLabel] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scope, setScope] = useState<Scope>('all');
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [categoryPreview, setCategoryPreview] = useState<Array<{ id: string; title: string; from: string; to?: string; error?: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamePreview, setRenamePreview] = useState<Array<{ id: string; from: string; to?: string; error?: string }>>([]);
  const [selectedRenameIds, setSelectedRenameIds] = useState<Set<string>>(new Set());
  const [renameScope, setRenameScope] = useState<Scope>('all');
  const [structureId, setStructureId] = useState(initialCategoryId || '');
  const [structurePreview, setStructurePreview] = useState<{ parentId: string; parentName: string; rename?: string; folders: Array<{ id: string; name: string; linkIds: string[]; selected: boolean }>; keep: string[] } | null>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info');
  const [stop, setStop] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => { stopRef.current = stop; }, [stop]);
  // 批量任务可能跑好几分钟：结束时基于最新数据合并，避免用开始时的旧快照覆盖期间的其它修改
  const linksRef = useRef(links);
  linksRef.current = links;
  const onUpdateLinksRef = useRef(onUpdateLinks);
  onUpdateLinksRef.current = onUpdateLinks;
  // 切到别的设置页或关闭设置时停止，不再在后台继续调用 AI
  useEffect(() => () => { stopRef.current = true; }, []);
  const categoryName = (id?: string) => categories.find(category => category.id === id)?.name || id || '';

  useEffect(() => {
    if (!initialCategoryId) return;
    setCategoryId(initialCategoryId);
    setStructureId(initialCategoryId);
    if (initialAIAction === 'rename') setRenameScope('category');
  }, [initialCategoryId, initialAIAction]);

  const notify = (text: string, tone: 'info' | 'error' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const endpointPreview = (() => {
    if (config.provider !== 'openai' || !config.baseUrl.trim()) return '';
    try { return normalizeOpenAIEndpoint(config.baseUrl); } catch (error) { return error instanceof Error ? error.message : 'API 地址无效'; }
  })();

  const applyPreset = (preset: typeof AI_PRESETS[number]) => {
    onChange('provider', preset.provider);
    onChange('baseUrl', preset.baseUrl);
    onChange('model', preset.model);
    // Secret 提示已常驻在预设下方，切换时不再重复弹同一句。
    setMessage('');
  };

  const testConnection = async () => {
    setIsProcessing(true);
    setLabel('正在测试 AI 接口');
    setMessage('');
    try {
      await testAIConnection(config);
      notify('AI 接口调用成功');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI 接口测试失败', 'error');
    } finally {
      setIsProcessing(false);
      setLabel('');
    }
  };

  const targets = () => {
    if (scope === 'category' && categoryId) {
      const childIds = categories.filter(category => category.parentId === categoryId).map(category => category.id);
      const ids = new Set([categoryId, ...childIds]);
      return links.filter(link => !link.deletedAt && ids.has(link.categoryId));
    }
    return links.filter(link => !link.deletedAt);
  };

  const ensureReady = (nextLabel: string) => {
    setIsProcessing(true);
    setLabel(nextLabel);
    setStop(false);
    stopRef.current = false;
    if (!config.model.trim()) {
      setIsProcessing(false);
      setLabel('');
      notify('请填写模型名称', 'error');
      return false;
    }
    if (config.provider === 'openai') {
      try { normalizeOpenAIEndpoint(config.baseUrl); } catch (error) {
        setIsProcessing(false);
        setLabel('');
        notify(error instanceof Error ? error.message : 'API 地址无效', 'error');
        return false;
      }
    }
    return true;
  };

  const generateDescriptions = async () => {
    const missing = links.filter(link => !link.description?.trim());
    if (!missing.length) { notify('所有书签都已有描述'); return; }
    if (!ensureReady('正在生成描述')) return;
    setProgress({ current: 0, total: missing.length });
    const descriptions = new Map<string, string>();
    for (let index = 0; index < missing.length && !stopRef.current; index += 1) {
      const link = missing[index];
      try {
        const description = await generateLinkDescription(link.title, link.url, config);
        if (description) descriptions.set(link.id, description);
      } catch (error) { notify(error instanceof Error ? error.message : '部分描述生成失败', 'error'); }
      setProgress({ current: index + 1, total: missing.length });
    }
    if (descriptions.size) {
      const now = Date.now();
      onUpdateLinksRef.current(linksRef.current.map(item => descriptions.has(item.id) && !item.description?.trim() ? { ...item, description: descriptions.get(item.id), updatedAt: now } : item));
    }
    notify(`描述生成完成：成功 ${descriptions.size} 个`);
    setIsProcessing(false);
    setLabel('');
  };

  const generateCategories = async () => {
    const available = categories.map(category => ({ id: category.id, name: category.name }));
    const target = targets();
    if (!target.length) { notify('没有可处理的书签', 'error'); return; }
    if (!ensureReady('正在生成分类预览')) return;
    setProgress({ current: 0, total: target.length });
    const preview: Array<{ id: string; title: string; from: string; to?: string; error?: string }> = [];
    for (let index = 0; index < target.length && !stopRef.current; index += 1) {
      const link = target[index];
      try {
        const to = await suggestCategory(link.title, link.url, available, config);
        preview.push({ id: link.id, title: link.title, from: link.categoryId, to: to || undefined, error: to ? undefined : 'AI 未返回分类' });
      } catch (error) { preview.push({ id: link.id, title: link.title, from: link.categoryId, error: error instanceof Error ? error.message : '生成失败' }); }
      setProgress({ current: index + 1, total: target.length });
    }
    setCategoryPreview(preview);
    setSelectedIds(new Set(preview.filter(item => item.to && item.to !== item.from).map(item => item.id)));
    setIsProcessing(false);
    setLabel('');
  };

  const applyCategories = () => {
    const changes = new Map(categoryPreview.filter(item => selectedIds.has(item.id) && item.to && item.to !== item.from).map(item => [item.id, item.to!]));
    if (!changes.size) return;
    onUpdateLinks(links.map(link => changes.has(link.id) ? { ...link, categoryId: changes.get(link.id), updatedAt: Date.now() } : link));
    setCategoryPreview([]);
    setSelectedIds(new Set());
  };

  const renameTargets = () => {
    const editable = categories.filter(category => category.id !== 'common' && !category.passwordHash);
    if (renameScope === 'category' && categoryId) return editable.filter(category => category.id === categoryId);
    if (renameScope === 'all') return editable;
    return editable.filter(category => !category.parentId);
  };

  const renameFolders = async () => {
    const target = renameTargets();
    if (!target.length) { notify('没有可重命名的分类', 'error'); return; }
    if (!ensureReady('正在生成分类名称')) return;
    setProgress({ current: 0, total: target.length });
    const preview: Array<{ id: string; from: string; to?: string; error?: string }> = [];
    for (let index = 0; index < target.length && !stopRef.current; index += 1) {
      const category = target[index];
      const samples = links.filter(link => link.categoryId === category.id).slice(0, 12).map(link => `${link.title} (${link.url})`);
      try {
        const result = await suggestFolderRename(category.name, samples, config);
        preview.push({ id: category.id, from: category.name, to: result.name, error: result.name === category.name ? '保持原名' : undefined });
      } catch (error) { preview.push({ id: category.id, from: category.name, error: error instanceof Error ? error.message : '生成失败' }); }
      setProgress({ current: index + 1, total: target.length });
    }
    setRenamePreview(preview);
    setSelectedRenameIds(new Set(preview.filter(item => item.to && item.to !== item.from).map(item => item.id)));
    setIsProcessing(false);
    setLabel('');
  };

  const applyRenames = () => {
    const names = new Map(renamePreview.filter(item => selectedRenameIds.has(item.id) && item.to && item.to !== item.from).map(item => [item.id, item.to!]));
    if (!names.size) return;
    const next = categories.map(category => names.has(category.id) ? { ...category, name: names.get(category.id)! } : category);
    if (onUpdateData) onUpdateData(links, next); else onUpdateCategories?.(next);
    setRenamePreview([]);
    setSelectedRenameIds(new Set());
  };

  const suggestStructure = async () => {
    const parent = categories.find(category => category.id === structureId);
    const parentLinks = links.filter(link => link.categoryId === structureId);
    if (!parent || parentLinks.length < 2) { notify('请选择至少包含两个书签的分类', 'error'); return; }
    if (!ensureReady('正在生成子分类建议')) return;
    try {
      const result = await suggestFolderStructure(parent.name, parentLinks, categories.map(category => category.name), config);
      setStructurePreview({ parentId: parent.id, parentName: parent.name, rename: result.rename, folders: result.folders.map(folder => ({ id: makeId('folder'), name: folder.name, linkIds: folder.linkIds, selected: true })), keep: result.keepInParent });
    } catch (error) { notify(error instanceof Error ? error.message : '生成子分类建议失败', 'error'); }
    finally { setIsProcessing(false); setLabel(''); }
  };

  const applyStructure = () => {
    if (!structurePreview) return;
    const selected = structurePreview.folders.filter(folder => folder.selected && folder.name.trim());
    const created: Category[] = selected.map(folder => ({ id: folder.id, name: folder.name.trim(), icon: 'Folder', parentId: structurePreview.parentId }));
    const moves = new Map(selected.flatMap(folder => folder.linkIds.map(id => [id, folder.id] as const)));
    const nextLinks = links.map(link => moves.has(link.id) ? { ...link, categoryId: moves.get(link.id)!, updatedAt: Date.now() } : link);
    const nextCategories = [...categories.map(category => category.id === structurePreview.parentId && structurePreview.rename ? { ...category, name: structurePreview.rename } : category), ...created];
    if (onUpdateData) onUpdateData(nextLinks, nextCategories); else { onUpdateLinks(nextLinks); onUpdateCategories?.(nextCategories); }
    setStructurePreview(null);
  };

  const editableCategories = categories.filter(category => category.id !== 'common');
  const progressPercent = progress.total ? Math.round(progress.current / progress.total * 100) : 0;
  // 预设高亮以 Base URL 主机为准（模型名可能重复）；Gemini 只看 provider。
  const hostOf = (value: string) => {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
  };
  const activePreset = (() => {
    if (config.provider === 'gemini') return 'gemini';
    const host = hostOf(config.baseUrl);
    if (!host) return '';
    return AI_PRESETS.find(preset => preset.provider === 'openai' && hostOf(preset.baseUrl) === host)?.id || '';
  })();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Section title="连接配置" desc="API Key 只从 Cloudflare Secrets 读取，不会进入浏览器或备份。">
        <div className="flex flex-wrap gap-1.5">
          {AI_PRESETS.map(preset => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${active
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line text-ink-soft hover:border-accent/50'}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-muted">
          Secret：<code className="text-ink-muted">{(AI_PRESETS.find(item => item.id === activePreset) || AI_PRESETS[0]).hint}</code>
        </p>

        {config.provider === 'openai' && (
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">Base URL</label>
            <input
              value={config.baseUrl}
              onChange={event => onChange('baseUrl', event.target.value)}
              className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://api.openai.com/v1"
            />
            {endpointPreview && (
              <p className={`mt-1 break-all text-[11px] ${endpointPreview.startsWith('http') ? 'text-ink-muted' : 'text-danger'}`}>
                最终地址：{endpointPreview}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">模型名称</label>
          <input
            value={config.model}
            onChange={event => onChange('model', event.target.value)}
            className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2">
          <span className="text-xs text-ink-muted">配置完成后先测一次接口</span>
          <button
            onClick={testConnection}
            disabled={isProcessing}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-inverse disabled:opacity-50"
          >
            测试连接
          </button>
        </div>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-xs ${messageTone === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-ink'}`}>
            {message}
          </p>
        )}
      </Section>

      <Section title="批量操作" desc="逐条调用 AI，可随时停止；结果先预览再应用。">
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>{label} {progress.current}/{progress.total}</span>
              <button onClick={() => setStop(true)} className="flex items-center gap-1 text-danger">
                <PauseCircle size={13} />停止
              </button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={generateDescriptions} disabled={isProcessing} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-40">
            <Sparkles size={14} />补全描述
          </button>
          <button onClick={generateCategories} disabled={isProcessing} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40">
            <FolderTree size={14} />生成分类
          </button>
          <button onClick={renameFolders} disabled={isProcessing} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40">
            <Type size={14} />重命名分类
          </button>
          <button onClick={suggestStructure} disabled={isProcessing} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40">
            <FolderPlus size={14} />拆分子分类
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
          <div>
            <label className="block text-[11px] text-ink-muted mb-1">分类范围</label>
            <select value={scope} onChange={event => setScope(event.target.value as Scope)} className="w-full rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-xs text-ink">
              <option value="all">全部书签</option>
              <option value="category">指定分类</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-ink-muted mb-1">重命名范围</label>
            <select value={renameScope} onChange={event => setRenameScope(event.target.value as Scope)} className="w-full rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-xs text-ink">
              <option value="all">全部分类</option>
              <option value="category">指定分类</option>
            </select>
          </div>
        </div>

        {(scope === 'category' || renameScope === 'category') && (
          <div>
            <label className="block text-[11px] text-ink-muted mb-1">目标分类</label>
            <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="w-full rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-xs text-ink">
              <option value="">选择分类</option>
              {editableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        )}

        {structurePreview === null && (
          <div>
            <label className="block text-[11px] text-ink-muted mb-1">拆分子分类的父分类</label>
            <select value={structureId} onChange={event => setStructureId(event.target.value)} className="w-full rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-xs text-ink">
              <option value="">选择分类</option>
              {editableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        )}
      </Section>

      {categoryPreview.length > 0 && (
        <Section
          title="分类预览"
          desc={`${categoryPreview.filter(item => item.to && item.to !== item.from).length} 条可应用`}
          action={<button onClick={applyCategories} className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white"><Check size={12} />应用</button>}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {categoryPreview.map(item => (
              <label key={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-sunken">
                <input
                  type="checkbox"
                  disabled={!item.to || item.to === item.from}
                  checked={selectedIds.has(item.id)}
                  onChange={() => setSelectedIds(current => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}
                />
                <span className="truncate text-ink-soft">{item.title}</span>
                <span className={`shrink-0 ${item.error ? 'text-danger' : 'text-ink-muted'}`}>{item.error || `${categoryName(item.from)} → ${categoryName(item.to)}`}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {renamePreview.length > 0 && (
        <Section
          title="重命名预览"
          desc={`${renamePreview.filter(item => item.to && item.to !== item.from).length} 项可应用`}
          action={<button onClick={applyRenames} className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white"><Check size={12} />应用</button>}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {renamePreview.map(item => (
              <label key={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-sunken">
                <input
                  type="checkbox"
                  disabled={!item.to || item.to === item.from}
                  checked={selectedRenameIds.has(item.id)}
                  onChange={() => setSelectedRenameIds(current => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}
                />
                <span className="text-ink-soft">{item.from}</span>
                <span className={item.error ? 'text-danger' : 'text-ink-muted'}>→ {item.error || item.to}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {structurePreview && (
        <Section
          title={`子分类预览：${structurePreview.parentName}`}
          desc={`${structurePreview.folders.filter(folder => folder.selected).length} 个分组待创建`}
          action={<button onClick={applyStructure} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"><Check size={12} />应用</button>}
        >
          <div className="space-y-1">
            {structurePreview.folders.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={folder.selected}
                  onChange={event => setStructurePreview(current => current ? { ...current, folders: current.folders.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item) } : current)}
                />
                <input
                  value={folder.name}
                  onChange={event => setStructurePreview(current => current ? { ...current, folders: current.folders.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)}
                  className="flex-1 rounded border border-line-strong bg-raised px-2 py-1 text-xs text-ink"
                />
                <span className="shrink-0 text-ink-muted">{folder.linkIds.length} 个</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default AISettingsTab;
