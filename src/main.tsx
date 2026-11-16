import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, getThemePref } from './theme';

// Thème appliqué avant le premier affichage (évite un flash du mauvais thème)
applyTheme(getThemePref());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
