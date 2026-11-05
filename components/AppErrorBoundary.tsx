import React from 'react';
import { LOCAL_STORAGE_KEY } from '../constants/storageKeys';

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  private resetLocalData = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    sessionStorage.clear();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
          <div className="text-sm font-semibold text-red-300 mb-2">Cove 启动失败</div>
          <h1 className="text-2xl font-bold mb-3">页面没有正常加载</h1>
          <p className="text-slate-300 text-sm mb-4">可能是旧缓存或本地数据异常。先强制刷新；如果还不行，再清本地缓存。</p>
          <pre className="max-h-40 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-red-100 whitespace-pre-wrap mb-4">{this.state.error.message}</pre>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium">重新加载</button>
            <button onClick={this.resetLocalData} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-medium">清本地缓存并重载</button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
