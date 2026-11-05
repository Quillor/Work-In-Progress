import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import './styles/flavor.css';
import './styles/flavor-components.css';
import './styles/app.css';
import HomePage from './pages/home';
import NotFound from './pages/not-found';

// Vite replaces DEV at build time, keeping internal tooling out of production chunks.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('./pages/design-system')) : null;
const CanvasPage = import.meta.env.DEV ? lazy(() => import('./features/canvas/pages/canvas')) : null;


createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><Suspense fallback={<p className="site-container" role="status">Loading…</p>}><Routes>
    <Route path="/" element={<HomePage />} />
    {DesignSystemPage && <Route path="/design-system" element={<DesignSystemPage />} />}
    {CanvasPage && <Route path="/canvas" element={<CanvasPage />} />}
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense><Toaster position="bottom-right" /></BrowserRouter></StrictMode>,
);
