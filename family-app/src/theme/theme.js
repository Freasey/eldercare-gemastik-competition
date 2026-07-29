/**
 * Sediakan palet aktif (terang/gelap) mengikuti setelan sistem, sama seperti
 * mockup HTML yang memakai `prefers-color-scheme`.
 */
import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, cardShadow } from './tokens.js';

const ThemeContext = createContext(palettes.light);

export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const colors = useMemo(() => (scheme === 'dark' ? palettes.dark : palettes.light), [scheme]);
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

/** @returns {typeof palettes.light} palet warna yang sedang aktif */
export function useColors() {
  return useContext(ThemeContext);
}

export function useIsDark() {
  return useColorScheme() === 'dark';
}

export { cardShadow };
