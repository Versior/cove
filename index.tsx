import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { ToastProvider } from './components/Toast';
import { migrateLegacyStorage } from './constants/storageKeys';
import './index.css';

migrateLegacyStorage();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);