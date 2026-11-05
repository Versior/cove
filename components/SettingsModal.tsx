import React, { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Bot, Cloud, CopyCheck, LayoutTemplate, Save, X } from 'lucide-react';
import { AIConfig, Category, LinkItem, SiteSettings } from '../types';
import { useModalA11y } from './useModalA11y';
import BackupSettingsTab from './BackupSettingsTab';
import SiteSettingsTab from './SiteSettingsTab';
import AISettingsTab from './AISettingsTab';
import DuplicateLinksPanel from './DuplicateLinksPanel';
import LinkCheckPanel from './LinkCheckPanel';
import TagManagerPanel from './TagManagerPanel';
import BookmarkletPanel from './BookmarkletPanel';

export type SettingsTab = 'site' | 'ai' | 'organize' | 'backup' | 'capture';
type OrganizeView = 'duplicates' | 'broken' | 'tags';

const ORGANIZE_VIEWS: Array<{ id: OrganizeView; label: string }> = [
  { id: 'duplicates', label: '重复网址' },
  { id: 'broken', label: '失效链接' },
  { id: 'tags', label: '标签' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
  onUpdateCategories?: (categories: Category[]) => void;
  onUpdateData?: (links: LinkItem[], categories: Category[]) => void;
  onEditLink?: (link: LinkItem) => void;
  onExportJson: () => void;
  onOpenImport: () => void;
  /** 未登录时不传，备份页隐藏「从云端恢复」。 */
  onRestoreBackup?: () => void;
  /** 标签管理里点「查看」：关闭设置并按标签筛选。 */
  onShowTag?: (tag: string) => void;
  lastBackup?: { status: string; at: number } | null;
  initialAICategoryId?: string;
  initialAIAction?: 'rename' | 'structure';
  initialTab?: SettingsTab;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  siteSettings,
  onSave,
  links,
  categories,
  onUpdateLinks,
  onUpdateCategories,
  onUpdateData,
  onEditLink,
  onExportJson,
  onOpenImport,
  onRestoreBackup,
  onShowTag,
  lastBackup,
  initialAICategoryId,
  initialAIAction,
  initialTab,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);
  const [activeTab, setActiveTab] = useState<SettingsTab>('site');
  const [organizeView, setOrganizeView] = useState<OrganizeView>('duplicates');
  const [localConfig, setLocalConfig] = useState(config);
  const [localSiteSettings, setLocalSiteSettings] = useState(siteSettings);

  useEffect(() => {
    if (!isOpen) return;
    setLocalConfig(config);
    setLocalSiteSettings(siteSettings);
    if (initialTab) setActiveTab(initialTab);
    else if (initialAICategoryId || initialAIAction) setActiveTab('ai');
  }, [isOpen, config, siteSettings, initialAICategoryId, initialAIAction, initialTab]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(current => ({ ...current, [key]: value }));
  };

  const handleSiteChange = (key: keyof SiteSettings, value: SiteSettings[keyof SiteSettings]) => {
    setLocalSiteSettings(current => ({ ...current, [key]: value }));
  };

  if (!isOpen) return null;

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof LayoutTemplate }> = [
    { id: 'site', label: '网站设置', icon: LayoutTemplate },
    { id: 'backup', label: '备份与恢复', icon: Cloud },
    { id: 'ai', label: 'AI 设置', icon: Bot },
    { id: 'organize', label: '书签整理', icon: CopyCheck },
    { id: 'capture', label: '快捷收藏', icon: BookmarkPlus },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-md">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="float-surface flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden md:flex-row"
      >
        {/* macOS 系统设置式侧栏 */}
        <div className="material-sidebar flex shrink-0 flex-row gap-1 overflow-x-auto p-2 md:w-52 md:flex-col">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[13px] transition-colors ${activeTab === tab.id
                ? 'bg-accent text-ink-inverse shadow-sm'
                : 'text-ink-soft hover:bg-white/35 dark:hover:bg-white/10'}`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              {tabs.find(t => t.id === activeTab)?.label || '设置'}
            </h3>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="rounded-full p-1 text-ink-muted transition-colors hover:bg-white/40 hover:text-ink dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            {activeTab === 'site' && <SiteSettingsTab value={localSiteSettings} onChange={handleSiteChange} />}
            {activeTab === 'backup' && <BackupSettingsTab links={links} onUpdateLinks={onUpdateLinks} onExportJson={onExportJson} onOpenImport={onOpenImport} onRestoreBackup={onRestoreBackup} lastBackup={lastBackup} />}
            {activeTab === 'ai' && <AISettingsTab config={localConfig} onChange={handleChange} links={links} categories={categories} onUpdateLinks={onUpdateLinks} onUpdateCategories={onUpdateCategories} onUpdateData={onUpdateData} initialCategoryId={initialAICategoryId} initialAIAction={initialAIAction} />}
            {activeTab === 'organize' && (
              <div className="space-y-4">
                <div className="inline-flex rounded-lg bg-sunken p-0.5" role="tablist">
                  {ORGANIZE_VIEWS.map(view => (
                    <button
                      key={view.id}
                      type="button"
                      role="tab"
                      aria-selected={organizeView === view.id}
                      onClick={() => setOrganizeView(view.id)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${organizeView === view.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
                {organizeView === 'duplicates' && <DuplicateLinksPanel links={links} categories={categories} onUpdateLinks={onUpdateLinks} onEditLink={onEditLink} />}
                {organizeView === 'broken' && <LinkCheckPanel links={links} categories={categories} onUpdateLinks={onUpdateLinks} onEditLink={onEditLink} />}
                {organizeView === 'tags' && <TagManagerPanel links={links} onUpdateLinks={onUpdateLinks} onShowTag={onShowTag} />}
              </div>
            )}
            {activeTab === 'capture' && <BookmarkletPanel />}
          </div>
          <div className="flex shrink-0 justify-end gap-2 px-5 py-3" style={{ boxShadow: 'inset 0 0.5px 0 hsl(var(--line) / 0.8)' }}>
            <button
              onClick={onClose}
              className="rounded-[7px] px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-white/40 dark:hover:bg-white/10"
            >
              取消
            </button>
            <button
              onClick={() => { onSave(localConfig, localSiteSettings); onClose(); }}
              className="flex items-center gap-1.5 rounded-[7px] bg-accent px-4 py-1.5 text-[13px] font-medium text-ink-inverse shadow-sm transition-opacity hover:opacity-90"
            >
              <Save size={14} /> 保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
