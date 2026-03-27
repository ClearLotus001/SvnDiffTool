import { createContext, useContext } from 'react';
import type { Theme } from '@/types';
import { THEMES } from '@/theme';

export const ThemeContext = createContext<Theme>(THEMES.dark);
export const useTheme = () => useContext(ThemeContext);
