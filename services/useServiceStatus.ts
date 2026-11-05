import React from 'react';
import type { LinkItem } from '../types';
import { classifyService, probeAll, type ServiceState } from './linkStatus';

const POLL_MS = 60_000;

/**
 * 自建服务在线状态：只探测开启了 monitor 的书签。
 * 页面在前台时每分钟一次；切到后台暂停，回到前台立刻补一次。
 * 返回 书签 id → 状态，供卡片显示小圆点。
 */
export const useServiceStatus = (links: LinkItem[], enabled: boolean): Record<string, ServiceState> => {
  const [statusMap, setStatusMap] = React.useState<Record<string, ServiceState>>({});
  // 只在被监测的书签集合变化时重启轮询，编辑标题等无关改动不会触发重新探测
  const key = links.filter(link => link.monitor && !link.deletedAt).map(link => `${link.id}|${link.url}`).sort().join('\n');

  React.useEffect(() => {
    if (!enabled || !key) {
      setStatusMap({});
      return;
    }
    const targets = key.split('\n').map(row => {
      const [id, ...rest] = row.split('|');
      return { id, url: rest.join('|') };
    });
    let alive = true;
    let timer: number | undefined;

    const run = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      const results = await probeAll(targets.map(target => target.url), { concurrency: 2, shouldStop: () => !alive });
      if (!alive) return;
      const byUrl = new Map(results.map(result => [result.url, classifyService(result)]));
      setStatusMap(Object.fromEntries(targets.map(target => [target.id, byUrl.get(target.url) || 'unknown'])));
    };
    const schedule = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void run(), POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void run();
        schedule();
      } else {
        window.clearInterval(timer);
      }
    };

    void run();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key, enabled]);

  return statusMap;
};
