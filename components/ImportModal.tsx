import React, { useState, useRef, useEffect } from 'react';
import { useModalA11y } from './useModalA11y';
import { X, Upload, FileText, Check, AlertCircle, FolderInput, ListTree, Database } from 'lucide-react';
import { Category, LinkItem } from '../types';
import { parseBookmarks } from '../services/bookmarkParser';
import { normalizeUrl } from '../services/duplicateService';
import { mergeImportedStructure } from '../services/importMerge';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLinks: LinkItem[];
  categories: Category[];
  onImport: (newLinks: LinkItem[], newCategories: Category[]) => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ 
  isOpen, 
  onClose, 
  existingLinks, 
  categories, 
  onImport,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, modalRef);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [analyzing, setAnalyzing] = useState(false);
  
  // Analysis Results
  const [newLinksCount, setNewLinksCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [newCategoriesCount, setNewCategoriesCount] = useState(0);
  
  // Staging Data
  const [parsedLinks, setParsedLinks] = useState<LinkItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [parsedCategories, setParsedCategories] = useState<Category[]>([]);
  
  // Options
  const [importMode, setImportMode] = useState<'original' | 'merge'>('original');
  const [targetCategoryId, setTargetCategoryId] = useState<string>(categories[0]?.id || 'common');
  const [importType, setImportType] = useState<'html' | 'json'>('html');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // Parse JSON backup file
  const parseJsonBackup = async (file: File): Promise<{ links: LinkItem[], categories: Category[] }> => {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate the structure
    if (!data.links || !Array.isArray(data.links) || !data.categories || !Array.isArray(data.categories)) {
      throw new Error('Invalid backup file format');
    }
    
    return { links: data.links, categories: data.categories };
  };


  const resetState = () => {
    setStep('upload');
    setParsedLinks([]);
    setParsedCategories([]);
    setNewLinksCount(0);
    setDuplicateCount(0);
    setNewCategoriesCount(0);
    setImportType('html');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'html' | 'json') => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setAnalyzing(true);
    setImportType(type);

    try {
        let result: { links: LinkItem[], categories: Category[] };
        
        if (type === 'html') {
            result = await parseBookmarks(selectedFile);
        } else {
            result = await parseJsonBackup(selectedFile);
        }
        
        // 2. Diff Logic — ignore protocol/www/trailing slash/tracking params
        const existingUrls = new Set(existingLinks.map(l => normalizeUrl(l.url)).filter(Boolean));

        const uniqueNewLinks: LinkItem[] = [];
        let duplicates = 0;

        result.links.forEach(link => {
            const normalizedUrl = normalizeUrl(link.url);
            if (normalizedUrl && existingUrls.has(normalizedUrl)) {
                duplicates++;
            } else {
                if (normalizedUrl) existingUrls.add(normalizedUrl); // also skip dups inside import file
                uniqueNewLinks.push(link);
            }
        });

        // 3. Category Diff：保留全部导入分类用于映射，只在计数时排除同名分类
        const existingCategoryNames = new Set(categories.map(c => c.name));
        const uniqueNewCategories = result.categories.filter(c => !existingCategoryNames.has(c.name));

        setParsedLinks(uniqueNewLinks);
        setParsedCategories(result.categories);
        setNewLinksCount(uniqueNewLinks.length);
        setDuplicateCount(duplicates);
        setNewCategoriesCount(uniqueNewCategories.length);
        
        setStep('preview');
    } catch (error) {
        const errorMessage = type === 'html' 
            ? "解析文件失败，请确保是标准的 Chrome HTML 书签文件。"
            : "解析文件失败，请确保是 Cove 导出的 JSON 备份文件。";
        alert(errorMessage);
        console.error(error);
    } finally {
        setAnalyzing(false);
    }
  };

  // 解析后默认全选,用户可在预览里勾选要导入哪些(#16)
  useEffect(() => {
    setSelectedIds(new Set(parsedLinks.map(l => l.id)));
  }, [parsedLinks]);
  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const executeImport = () => {
      let finalLinks = parsedLinks.filter(l => selectedIds.has(l.id));
      let finalCategories: Category[] = [];

      if (importMode === 'merge') {
          // Flatten all new links to the target category
          finalLinks = finalLinks.map(link => ({
              ...link,
              categoryId: targetCategoryId
          }));
          // In merge mode, we do NOT add new categories from the file
          finalCategories = []; 
      } else {
          // 保留原结构：同名分类合并到现有分类，其余作为新分类加入
          const merged = mergeImportedStructure(finalLinks, parsedCategories, categories);
          finalLinks = merged.links;
          finalCategories = merged.categories;
      }

      onImport(finalLinks, finalCategories);
      handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} role="dialog" aria-modal="true" className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Upload size={20} className="text-blue-500"/> 导入书签
          </h3>
          <button onClick={handleClose} aria-label="关闭" className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
            
            {step === 'upload' && (
                <div className="space-y-4">
                    {/* HTML Import Option */}
                    <div className="flex flex-col items-center justify-center space-y-4 py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                         onClick={() => fileInputRef.current?.click()}>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            tabIndex={-1}
                            accept=".html"
                            onChange={(e) => handleFileChange(e, 'html')} 
                        />
                        
                        {analyzing && importType === 'html' ? (
                            <div className="flex flex-col items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-2"></div>
                                <span className="text-slate-500">正在分析书签文件...</span>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                                    <FileText size={32} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium dark:text-white">点击选择 HTML 文件</p>
                                    <p className="text-xs text-slate-500 mt-1">支持 Chrome, Edge, Firefox 导出的书签</p>
                                </div>
                            </>
                        )}
                    </div>
                    
                    {/* JSON Import Option */}
                    <div className="flex flex-col items-center justify-center space-y-4 py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                         onClick={() => jsonFileInputRef.current?.click()}>
                        <input 
                            type="file" 
                            ref={jsonFileInputRef} 
                            className="hidden" 
                            tabIndex={-1}
                            accept=".json"
                            onChange={(e) => handleFileChange(e, 'json')} 
                        />
                        
                        {analyzing && importType === 'json' ? (
                            <div className="flex flex-col items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-2"></div>
                                <span className="text-slate-500">正在分析备份文件...</span>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                                    <Database size={32} />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-slate-500 mt-1">导入 JSON 书签数据，可兼容旧版导出文件</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {step === 'preview' && (
                <div className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center border border-green-100 dark:border-green-900/30">
                            <div className="text-xl font-bold text-green-600 dark:text-green-400">{newLinksCount}</div>
                            <div className="text-xs text-green-700 dark:text-green-500">新增链接</div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center border border-slate-200 dark:border-slate-600">
                            <div className="text-xl font-bold text-slate-600 dark:text-slate-400">{duplicateCount}</div>
                            <div className="text-xs text-slate-500">重复跳过</div>
                        </div>
                         <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center border border-purple-100 dark:border-purple-900/30">
                            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{importMode === 'original' ? newCategoriesCount : 0}</div>
                            <div className="text-xs text-purple-700 dark:text-purple-500">新增分类</div>
                        </div>
                    </div>

                    {parsedLinks.length > 0 && (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 text-xs">
                          <span className="text-slate-500">勾选要导入的 {selectedIds.size}/{parsedLinks.length}</span>
                          <div className="flex gap-2">
                            <button onClick={() => setSelectedIds(new Set(parsedLinks.map(l => l.id)))} className="text-blue-600 hover:underline">全选</button>
                            <button onClick={() => setSelectedIds(new Set())} className="text-slate-500 hover:underline">取消</button>
                          </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                          {parsedLinks.map(l => (
                            <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                              <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} className="w-3.5 h-3.5 rounded shrink-0" />
                              <span className="truncate flex-1 dark:text-slate-200">{l.title}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {newLinksCount === 0 ? (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
                            <AlertCircle size={16} />
                            <span>未发现新链接，所有链接已存在。</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label className="text-sm font-medium dark:text-slate-300">导入方式</label>
                            
                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${importMode === 'original' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                <input type="radio" name="mode" className="mt-1" checked={importMode === 'original'} onChange={() => setImportMode('original')} />
                                <div>
                                    <div className="flex items-center gap-2 font-medium text-sm dark:text-white">
                                        <ListTree size={16} /> 保持原目录结构
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">如果分类不存在，将自动创建。</p>
                                </div>
                            </label>

                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${importMode === 'merge' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                <input type="radio" name="mode" className="mt-1" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
                                <div className="w-full">
                                    <div className="flex items-center gap-2 font-medium text-sm dark:text-white">
                                        <FolderInput size={16} /> 全部导入到指定目录
                                    </div>
                                    <div className="mt-2">
                                        <select 
                                            value={targetCategoryId}
                                            onChange={(e) => setTargetCategoryId(e.target.value)}
                                            disabled={importMode !== 'merge'}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full text-sm p-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none"
                                        >
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </label>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
            {step === 'upload' ? (
                <button onClick={handleClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
            ) : (
                <>
                    <button onClick={resetState} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">重新选择</button>
                    <button 
                        onClick={executeImport} 
                        disabled={newLinksCount === 0}
                        className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 font-medium"
                    >
                        <Check size={16} /> 确认导入 ({newLinksCount})
                    </button>
                </>
            )}
        </div>

      </div>
    </div>
  );
};

export default ImportModal;