import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function createThemeStore() {
  // Get initial theme from localStorage or default to dark
  const initialTheme: Theme = browser 
    ? (localStorage.getItem('theme') as Theme) || 'dark'
    : 'dark';

  const { subscribe, set } = writable<Theme>(initialTheme);

  return {
    subscribe,
    toggle: () => {
      if (browser) {
        const currentTheme = localStorage.getItem('theme') as Theme || 'dark';
        const newTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.classList.toggle('light-mode', newTheme === 'light');
        set(newTheme);
      }
    },
    init: () => {
      if (browser) {
        const theme = localStorage.getItem('theme') as Theme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('light-mode', theme === 'light');
        set(theme);
      }
    }
  };
}

export const themeStore = createThemeStore();
