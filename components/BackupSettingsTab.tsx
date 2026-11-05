import { Cloud, Download, FileUp, History } from 'lucide-react';

interface BackupSettingsTabProps {
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

const BackupSettingsTab: React.FC<BackupSettingsTabProps> = ({ onExportJson, onOpenImport, onRestoreBackup, lastBackup }) => (
  <div className="space-y-6 animate-in fade-in duration-300">
    <section className="space-y-3">
      <div>
        <h4 className="text-base font-semibold text-slate-800 dark:text-white">本地备份</h4>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">导出或导入 Cove 的 JSON 数据文件。</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={onExportJson} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Download size={16} />导出 JSON
        </button>
        <button onClick={onOpenImport} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
          <FileUp size={16} />导入备份
        </button>
      </div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-start gap-3">
        <Cloud size={20} className="mt-0.5 shrink-0 text-blue-500" />
        <div className="space-y-2 text-sm">
          <h4 className="font-semibold text-slate-800 dark:text-white">R2 自动备份</h4>
          <p className="text-slate-500 dark:text-slate-400">书签数据发生变化时，由 Pages Functions 自动覆盖最新备份。</p>
          <dl className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex gap-2"><dt className="font-medium">对象：</dt><dd><code>cove/latest.json</code></dd></div>
            <div className="flex gap-2"><dt className="font-medium">绑定：</dt><dd><code>COVE_BACKUPS</code></dd></div>
            <div className="flex gap-2"><dt className="font-medium">重复数据：</dt><dd>跳过上传</dd></div>
            <div className="flex gap-2">
              <dt className="font-medium">最近一次：</dt>
              <dd>{lastBackup ? `${BACKUP_LABELS[lastBackup.status] || lastBackup.status} · ${new Date(lastBackup.at).toLocaleTimeString()}` : '本次会话尚未保存'}</dd>
            </div>
          </dl>
          {onRestoreBackup && (
            <button onClick={onRestoreBackup} className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <History size={14} />从 R2 备份恢复
            </button>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500">「最近一次」来自本页面最近一次保存响应，刷新后重置。</p>
        </div>
      </div>
    </section>
  </div>
);

export default BackupSettingsTab;
