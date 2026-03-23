import { writable } from 'svelte/store';
import { apiPost, apiGet } from '../utils/api';

type User = {
  id: string;
  username: string;
  role: 'admin' | 'member';
  status: 'approved' | 'pending';
  needsUsernameSetup?: boolean;
  bio?: string | null;
  location?: string | null;
};

type AuthState = {
  user: User | null;
  isLoading: boolean;
  error: string | null;
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    isLoading: false,
    error: null,
  });

  return {
    subscribe,
    
    async checkAuth() {
      update(state => ({ ...state, isLoading: true }));
      try {
        const res = await apiGet('/api/auth/me');
        if (res.ok) {
          const user = await res.json();
          set({ user, isLoading: false, error: null });
          // Set presence to online
          void apiPost('/api/presence', { status: 'online' }).catch(() => {});
        } else {
          set({ user: null, isLoading: false, error: null });
        }
      } catch (error) {
        set({ user: null, isLoading: false, error: 'Failed to check auth' });
      }
    },

    async login(username: string, password: string) {
      update(state => ({ ...state, isLoading: true, error: null }));
      try {
        const res = await apiPost('/api/auth/login', { username, password });
        if (res.ok) {
          const data = await res.json();
          set({ user: data, isLoading: false, error: null });
          // Set presence to online
          void apiPost('/api/presence', { status: 'online' }).catch(() => {});
          return { success: true };
        } else {
          const error = await res.json();
          update(state => ({ ...state, isLoading: false, error: error.error || 'Login failed' }));
          return { success: false, error: error.error || 'Login failed' };
        }
      } catch (error) {
        update(state => ({ ...state, isLoading: false, error: 'Network error' }));
        return { success: false, error: 'Network error' };
      }
    },

    async register(username: string, password: string) {
      update(state => ({ ...state, isLoading: true, error: null }));
      try {
        const res = await apiPost('/api/auth/register', { username, password });
        if (res.ok) {
          update(state => ({ ...state, isLoading: false }));
          // Auto-login after registration
          const loginResult = await this.login(username, password);
          return loginResult;
        } else {
          const error = await res.json();
          update(state => ({ ...state, isLoading: false, error: error.error || 'Registration failed' }));
          return { success: false, error: error.error || 'Registration failed' };
        }
      } catch (error) {
        update(state => ({ ...state, isLoading: false, error: 'Network error' }));
        return { success: false, error: 'Network error' };
      }
    },

    async logout() {
      try {
        await apiPost('/api/presence', { status: 'offline' });
      } catch (e) {
        // Ignore presence error
      }
      try {
        await apiPost('/api/auth/logout', {});
      } catch (e) {
        // Ignore logout error
      }
      set({ user: null, isLoading: false, error: null });
    },

    async refreshUser() {
      try {
        const res = await apiGet('/api/auth/me');
        if (res.ok) {
          const user = await res.json();
          update(state => ({ ...state, user }));
        }
      } catch (error) {
        console.error('Failed to refresh user:', error);
      }
    },

    updateUser(updates: Partial<User>) {
      update(state => ({
        ...state,
        user: state.user ? { ...state.user, ...updates } : null
      }));
    },
  };
}

export const authStore = createAuthStore();
