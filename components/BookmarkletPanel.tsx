import React from 'react';
import { BookmarkPlus, Check, Copy } from 'lucide-react';

/**
 * 书签小工具（Bookmarklet）：拖到浏览器书签栏，任意网页上点一下就能收藏到 Cove。
 * 复用 PWA 分享已有的 ?add_url= 入口，不需要扩展，也不需要单独的 Token。
 * popup=1 让收藏窗口在保存后自动关闭。
 */
export const buildBookmarklet = (origin: string) =>
  `javascript:(()=>{const u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open('${origin}/?popup=1&add_url='+u+'&add_title='+t,'cove-save','width=520,height=760');})();`;

const BookmarkletPanel: React.FC = () => {
  const code = buildBookmarklet(window.location.origin);
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = React.useState(false);

  // React 19 会拦截 href 里的 javascript: 地址，这里绕开 React 直接写 DOM 属性
  React.useEffect(() => {
    linkRef.current?.setAttribute('href', code);
  }, [code]);

  const copy = async () => {
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-ink">书签小工具</h4>
          <p className="mt-1 text-xs text-ink-soft">把下面的按钮拖到浏览器书签栏。在任意网页上点它，就会弹出 Cove 的添加窗口，标题和网址已经填好。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            ref={linkRef}
            onClick={event => { event.preventDefault(); }}
            draggable
            title="拖到书签栏，不要直接点击"
            className="inline-flex cursor-grab items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink-inverse shadow-sm active:cursor-grabbing"
          >
            <BookmarkPlus size={16} />收藏到 Cove
          </a>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '已复制' : '复制代码'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-sunken p-4 text-xs leading-relaxed text-ink-soft">
        <p className="font-medium text-ink">拖不过去时</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>先按 <kbd className="rounded bg-raised px-1">Ctrl/⌘ + Shift + B</kbd> 显示书签栏</li>
          <li>或者点「复制代码」，在书签栏右键新建书签，把代码粘贴到「网址」一栏</li>
        </ol>
        <p className="mt-2 text-ink-muted">保存后窗口会自动关闭。未登录时会先要求输入访问密码。手机上用浏览器的「分享 → Cove」即可（需先把 Cove 添加到主屏幕）。</p>
      </section>
    </div>
  );
};

export default BookmarkletPanel;
