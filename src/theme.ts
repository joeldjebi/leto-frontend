import { useEffect, useState } from 'react';

/** Thème du back-office : Automatique (suit le système), Clair ou Sombre — mémorisé dans le navigateur */
export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'leto_theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'auto' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => {
    applyTheme(pref);
    try {
      if (pref === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    if (pref !== 'auto') return;
    const m = media();
    const on = () => applyTheme('auto');
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [pref]);
  return [pref, setPref];
}
