import React from 'react';
import { LinkItem, Category } from '../types';

/**
 * 拼音匹配按需加载：pinyin-pro 带字典约 460 KB，只有搜索时才用得到。
 * 加载完成前 matchesQuery 只做普通文本匹配。
 */
let pinyinFn: typeof import('pinyin-pro').pinyin | null = null;
let pinyinLoading: Promise<void> | null = null;
export const isPinyinReady = () => pinyinFn !== null;
export const loadPinyin = () => {
  pinyinLoading ??= import('pinyin-pro').then(module => { pinyinFn = module.pinyin; });
  return pinyinLoading;
};

export interface ParsedQuery { tag?: string; cat?: string; visited?: number; text: string }
const getLinkSearchText = (link: LinkItem) => [link.title, link.url, link.description, link.note, (link.tags || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
export const parseSearchQuery = (query: string): ParsedQuery => {
  let text = query.trim().toLowerCase();
  const tagMatch = text.match(/\btag:(\S+)/); const catMatch = text.match(/\bcat:(\S+)/); const visitedMatch = text.match(/\bvisited:(\d+)/);
  const tag = tagMatch?.[1]; const cat = catMatch?.[1]; const visited = visitedMatch ? Number(visitedMatch[1]) : undefined;
  if (tagMatch) text = text.replace(tagMatch[0], '').trim(); if (catMatch) text = text.replace(catMatch[0], '').trim(); if (visitedMatch) text = text.replace(visitedMatch[0], '').trim();
  return { tag, cat, visited, text };
};
export const matchesFilters = (link: LinkItem, parsed: ParsedQuery, categories: Category[]) => {
  if (parsed.tag && !link.tags?.some(tag => tag.toLowerCase().includes(parsed.tag!))) return false;
  if (parsed.cat) {
    const ids = new Set(categories.filter(category => category.id.toLowerCase() === parsed.cat || category.name.toLowerCase().includes(parsed.cat!)).flatMap(category => [category.id, ...categories.filter(child => child.parentId === category.id).map(child => child.id)]));
    if (!ids.has(link.categoryId)) return false;
  }
  if (parsed.visited !== undefined && (!link.lastVisitedAt || link.lastVisitedAt < Date.now() - parsed.visited * 86400000)) return false;
  return true;
};
export const matchesQuery = (link: LinkItem, query: string) => {
  const value = query.trim().toLowerCase(); if (!value) return true; if (getLinkSearchText(link).includes(value)) return true;
  const pinyin = pinyinFn; if (!pinyin) return false;
  try { return pinyin(link.title, { toneType: 'none', type: 'array' }).join('').toLowerCase().includes(value) || pinyin(link.title, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase().includes(value); } catch { return false; }
};
export const sortByRelevance = (links: LinkItem[], query: string) => [...links].sort((a, b) => Number(b.title.toLowerCase().includes(query.toLowerCase())) - Number(a.title.toLowerCase().includes(query.toLowerCase())) || (b.visitCount || 0) - (a.visitCount || 0));
export const highlightMatch = (text: string, query: string): React.ReactNode => { const value = query.trim(); const index = text.toLowerCase().indexOf(value.toLowerCase()); if (index < 0) return text; return <>{text.slice(0, index)}<mark className="bg-yellow-200 rounded px-0.5">{text.slice(index, index + value.length)}</mark>{text.slice(index + value.length)}</>; };
