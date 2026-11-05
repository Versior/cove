import React from 'react';
import type { LinkItem } from '../types';

/** 同源图标代理地址：由 Cloudflare 边缘抓图，浏览器不直连外站。 */
export const faviconProxyUrl = (origin: string) => `/api/favicon?url=${encodeURIComponent(origin)}`;

/**
 * favicon 候选地址，**代理优先**：
 * 直连站点图标常被 Chrome 的 ORB（Opaque Response Blocking）拦掉，
 * 而 /api/favicon 是同源请求，不受 ORB 影响。直连只作为后备。
 */
const faviconCandidates = (url: string): string[] => {
  try {
    const { origin } = new URL(url);
    return [faviconProxyUrl(origin), `${origin}/favicon.ico`, `${origin}/apple-touch-icon.png`];
  } catch {
    return [];
  }
};

/**
 * 某条书签的候选列表：自定义图标排最前，去重。
 * 「获取图标」按钮写入的也是代理地址，不去重的话失败时会对同一张图探测两次。
 */
export const linkIconCandidates = (link: Pick<LinkItem, 'icon' | 'url'>): string[] =>
  Array.from(new Set([link.icon, ...faviconCandidates(link.url)].filter((value): value is string => !!value)));

/** 单张图探测的超时。代理要在边缘现场抓图，冷启动实测 1–3s。 */
const PROBE_TIMEOUT = 5000;

/**
 * 全局并发闸门：首屏几十张卡片、每张多个候选，全部同时发出会互相挤到超时。
 * 限制并发后请求排队，但每个都能在超时内完成。
 */
const MAX_CONCURRENT = 8;
let inFlight = 0;
const waiting: Array<() => void> = [];

const acquire = (): Promise<void> => {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    waiting.push(() => {
      inFlight += 1;
      resolve();
    });
  });
};

const release = () => {
  inFlight -= 1;
  const next = waiting.shift();
  if (next) next();
};

/** 探测一张图能否加载，受全局并发闸门约束；成功返回地址，失败返回 null。 */
export const probe = async (src: string): Promise<string | null> => {
  await acquire();
  try {
    return await new Promise<string | null>(resolve => {
      const image = new Image();
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), PROBE_TIMEOUT);
      // 部分站点会因为带了 referer 而拒绝返回图标
      image.referrerPolicy = 'no-referrer';
      image.onload = () => finish(image.naturalWidth > 0 ? src : null);
      image.onerror = () => finish(null);
      image.src = src;
    });
  } finally {
    release();
  }
};

/**
 * 按候选列表解析结果，全局共享。
 * 同一条书签会同时出现在置顶区、主网格和 Dock 里，共享后只探测一次。
 */
const resolved = new Map<string, Promise<string>>();

const resolveCandidates = (key: string): Promise<string> => {
  const existing = resolved.get(key);
  if (existing) return existing;
  const task = (async () => {
    for (const candidate of key.split('|')) {
      const hit = await probe(candidate);
      if (hit) return hit;
    }
    return '';
  })();
  resolved.set(key, task);
  return task;
};

/**
 * 图标解析结果：null 表示还在探测，'' 表示全部失败（走首字母兜底）。
 * 候选按优先级串行探测，第一个成功即止。
 */
export const useFaviconSrc = (candidates: string[]): string | null => {
  // 用字符串做依赖，避免每次渲染新建的数组触发无限重跑
  const key = candidates.join('|');
  const [state, setState] = React.useState<{ key: string; src: string | null }>(() => ({ key, src: key ? null : '' }));

  React.useEffect(() => {
    if (!key) {
      setState({ key, src: '' });
      return;
    }
    let alive = true;
    setState(current => (current.key === key ? current : { key, src: null }));
    void resolveCandidates(key).then(src => {
      if (alive) setState({ key, src });
    });
    return () => { alive = false; };
  }, [key]);

  return state.key === key ? state.src : null;
};
