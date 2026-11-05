import { LinkItem } from '../types';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_reader', 'utm_name', 'utm_social', 'utm_social-type',
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid',
  'igshid', 'si', 'spm', 'from', 'ref', 'ref_src', 'source',
]);

/** Normalize URL for duplicate comparison (host/path focused, strip tracking). */
export const normalizeUrl = (raw: string): string => {
  let input = (raw || '').trim();
  if (!input) return '';
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  try {
    const url = new URL(input);
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);

    const isDefaultPort =
      (!url.port) ||
      (url.port === '80' && url.protocol === 'http:') ||
      (url.port === '443' && url.protocol === 'https:');
    const port = isDefaultPort ? '' : `:${url.port}`;

    let path = url.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

    const params = new URLSearchParams(url.search);
    const kept = new URLSearchParams();
    const keys = [...new Set([...params.keys()])]
      .filter(key => !TRACKING_PARAMS.has(key.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      for (const value of params.getAll(key)) kept.append(key, value);
    }
    const query = kept.toString();

    // Ignore hash; protocol differences are collapsed by host+path key.
    return `${host}${port}${path}${query ? `?${query}` : ''}`;
  } catch {
    return (raw || '').trim().replace(/\/+$/, '').toLowerCase();
  }
};

export interface DuplicateLinkMember {
  link: LinkItem;
  score: number;
  isRecommendedKeep: boolean;
}

export interface DuplicateGroup {
  key: string;
  displayUrl: string;
  members: DuplicateLinkMember[];
  recommendedKeepId: string;
}

const scoreLink = (link: LinkItem): number => {
  let score = 0;
  if (link.pinned) score += 1000;
  score += Math.min(link.visitCount || 0, 200) * 5;
  if (link.note?.trim()) score += 40;
  if (link.description?.trim()) score += 20;
  if (link.tags && link.tags.length > 0) score += 10;
  if (link.icon) score += 5;
  if (link.lastVisitedAt) score += Math.min(link.lastVisitedAt / 1e12, 50);
  if (link.updatedAt) score += Math.min(link.updatedAt / 1e13, 20);
  if (link.createdAt) score += Math.min(link.createdAt / 1e13, 10);
  return score;
};

export const findDuplicateGroups = (links: LinkItem[]): DuplicateGroup[] => {
  const active = links.filter(link => !link.deletedAt);
  const buckets = new Map<string, LinkItem[]>();

  for (const link of active) {
    const key = normalizeUrl(link.url);
    if (!key) continue;
    const list = buckets.get(key) || [];
    list.push(link);
    buckets.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of buckets) {
    if (members.length < 2) continue;

    const scored = members
      .map(link => ({ link, score: scoreLink(link) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.link.createdAt || 0) - (a.link.createdAt || 0);
      });

    const recommendedKeepId = scored[0].link.id;
    groups.push({
      key,
      displayUrl: scored[0].link.url,
      recommendedKeepId,
      members: scored.map(item => ({
        link: item.link,
        score: item.score,
        isRecommendedKeep: item.link.id === recommendedKeepId,
      })),
    });
  }

  groups.sort((a, b) => b.members.length - a.members.length || a.displayUrl.localeCompare(b.displayUrl));
  return groups;
};

export const findDuplicatesOfUrl = (
  url: string,
  links: LinkItem[],
  excludeId?: string
): LinkItem[] => {
  const key = normalizeUrl(url);
  if (!key) return [];
  return links.filter(link =>
    !link.deletedAt &&
    link.id !== excludeId &&
    normalizeUrl(link.url) === key
  );
};

export const summarizeDuplicateScan = (groups: DuplicateGroup[]) => {
  const duplicateLinks = groups.reduce((sum, group) => sum + group.members.length, 0);
  const removable = groups.reduce((sum, group) => sum + Math.max(0, group.members.length - 1), 0);
  return {
    groupCount: groups.length,
    duplicateLinks,
    removable,
  };
};
