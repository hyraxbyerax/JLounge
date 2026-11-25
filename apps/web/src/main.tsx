import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './shared/styles/tokens.css';
import './shared/styles/base.css';
// 픽셀 마감은 화면 CSS(App 안에서 불러옴)보다 나중이어야 해서 마지막에
import './shared/styles/pixel.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
