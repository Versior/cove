import { Cloud, Download, FileUp, History } from 'lucide-react';
import type { LinkItem } from '../types';
import IconSlimPanel from './IconSlimPanel';

interface BackupSettingsTabProps {
  links: LinkItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
  onExportJson: () => void;
  onOpenImport: () => void;
  onRestoreBackup?: () => void;
  lastBackup?: { status: string; at: number } | null;
}

const BACKUP_LABELS: Record<string, string> = {
  saved: '已写入 R2',
  skipped: '内容未变化，跳过上传',
  scheduled: '已在后台排队写入',
  failed: '写入失败',
  'missing-binding': '未绑定 R2',
  unknown: '未返回状态',
};

const BackupSettingsTab: React.FC<BackupSettingsTabProps> = ({ links, onUpdateLinks, onExportJson, onOpenImport, onRestoreBackup, lastBackup }) => (
  <div className="space-y-5 animate-in fade-in duration-300">
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">本地备份</h4>
        <p className="mt-1 text-xs text-ink-soft">导出或导入 Cove 的 JSON 数据文件。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onExportJson} className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-ink-inverse transition-opacity hover:opacity-90">
          <Download size={14} />导出 JSON
        </button>
        <button onClick={onOpenImport} className="flex items-center gap-2 rounded-lg border border-line-strong bg-raised px-3.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:text-ink">
          <FileUp size={14} />导入备份
        </button>
      </div>
    </section>

    <section className="rounded-xl border border-line bg-sunken p-4">
      <div className="flex items-start gap-3">
        <Cloud size={20} className="mt-0.5 shrink-0 text-accent" />
        <div className="space-y-2 text-sm">
          <h4 className="font-semibold text-ink">R2 自动备份</h4>
          <p className="text-ink-soft">书签数据发生变化时，由 Pages Functions 自动覆盖最新备份。</p>
          <dl className="space-y-1 text-xs text-ink-muted">
            <div className="flex gap-2"><dt className="font-medium">对象：</dt><dd><code>cove/latest.json</code></dd></div>
            <div className="flex gap-2"><dt className="font-medium">绑定：</dt><dd><code>COVE_BACKUPS</code></dd></div>
            <div className="flex gap-2"><dt className="font-medium">重复数据：</dt><dd>跳过上传</dd></div>
            <div className="flex gap-2">
              <dt className="font-medium">最近一次：</dt>
              <dd>{lastBackup ? `${BACKUP_LABELS[lastBackup.status] || lastBackup.status} · ${new Date(lastBackup.at).toLocaleTimeString()}` : '本次会话尚未保存'}</dd>
            </div>
          </dl>
          {onRestoreBackup && (
            <button onClick={onRestoreBackup} className="mt-1 flex items-center gap-2 rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-ink">
              <History size={14} />从 R2 备份恢复
            </button>
          )}
          <p className="text-xs text-ink-muted">「最近一次」来自本页面最近一次保存响应，刷新后重置。</p>
        </div>
      </div>
    </section>

    <IconSlimPanel links={links} onUpdateLinks={onUpdateLinks} />
  </div>
);

export default BackupSettingsTab;
