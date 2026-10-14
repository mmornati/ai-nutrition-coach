import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { installPrompt } from './pwa/install';
import { startAppUpdate } from './pwa/app-update';

// The browser fires `beforeinstallprompt` once and early: capture it before any screen exists.
installPrompt.attach(window);
// Release build + secure context only; checks for a new version on load and on foreground.
startAppUpdate();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
