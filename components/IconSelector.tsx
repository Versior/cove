import React, { useState } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import Icon, { COMMON_ICON_NAMES, loadAllIcons } from './Icon';

interface IconSelectorProps {
  onSelectIcon: (iconName: string) => void;
}

const commonIcons = COMMON_ICON_NAMES;

const IconSelector: React.FC<IconSelectorProps> = ({ 
  onSelectIcon
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const [customIconName, setCustomIconName] = useState('');
  const [isValidIcon, setIsValidIcon] = useState(true);


  // 过滤图标
  const filteredIcons = commonIcons.filter(icon => 
    icon.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 将 kebab-case 转换为 PascalCase
  const kebabToPascal = (kebabName: string): string => {
    return kebabName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  // 把用户输入（star / cloud-rain / CloudRain）转成 lucide 的导出名
  const toIconName = (iconName: string): string => {
    const trimmed = iconName.trim();
    if (trimmed.includes('-')) return kebabToPascal(trimmed);
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const handleSelect = (iconName: string) => {
    setSelectedIcon(iconName);
    setCustomIconName('');
    setIsValidIcon(true);
  };

  const handleCustomIconChange = async (iconName: string) => {
    setCustomIconName(iconName);
    if (!iconName.trim()) {
      setIsValidIcon(true);
      return;
    }
    // 非常用图标需要完整图标集才能校验，首次输入时懒加载
    const finalIconName = toIconName(iconName);
    const allIcons = commonIcons.includes(finalIconName) ? null : await loadAllIcons();
    const isValid = !allIcons || finalIconName in allIcons;
    setIsValidIcon(isValid);
    if (isValid) setSelectedIcon(finalIconName);
  };

  const handleConfirm = () => {
    onSelectIcon(selectedIcon);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索图标..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* Custom Icon Input */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">输入图标名称:</span>
            <a 
              href="https://lucide.dev/icons/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink size={12} />
              查看所有图标
            </a>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="例如: star, heart, cloud..."
              value={customIconName}
              onChange={(e) => void handleCustomIconChange(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                customIconName && !isValidIcon 
                  ? 'border-red-300 dark:border-red-700' 
                  : 'border-slate-300 dark:border-slate-600'
              } dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none`}
            />
            {customIconName && !isValidIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-xs text-red-500">无效图标</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Selection */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">当前选择:</span>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
            <Icon name={selectedIcon} size={18} />
            <span className="text-sm font-medium dark:text-slate-200">{selectedIcon}</span>
          </div>
        </div>
      </div>

      {/* Confirm Selection */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            提示：可以输入 Lucide 图标名称或选择图标库
          </div>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            确定选择
          </button>
        </div>
      </div>

      {/* Icons Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredIcons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Search size={40} className="mb-3 opacity-50" />
            <p>没有找到匹配的图标</p>
          </div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {filteredIcons.map(iconName => (
              <button
                key={iconName}
                onClick={() => handleSelect(iconName)}
                className={`p-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                  selectedIcon === iconName 
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
                title={iconName}
              >
                <Icon name={iconName} size={20} />
                <span className="text-xs truncate w-full text-center">{iconName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IconSelector;