import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { installPrompt } from './pwa/install';

// The browser fires `beforeinstallprompt` once and early: capture it before any screen exists.
installPrompt.attach(window);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
