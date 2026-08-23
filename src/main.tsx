import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import './styles/flavor.css';
import './styles/flavor-components.css';
import './styles/app.css';

import HomePage from './pages/home';
import DesignSystemPage from './pages/design-system';
import CanvasPage from './features/canvas/pages/canvas';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route path="/canvas" element={<CanvasPage />} />
      </Routes>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  </StrictMode>,
);
