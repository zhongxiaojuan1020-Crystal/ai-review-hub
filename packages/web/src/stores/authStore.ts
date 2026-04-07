import { create } from 'zustand';
import api from '../api/client';

interface AuthUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: 'member' | 'supervisor';
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (name: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: true,

  login: async (name: string, password: string) => {
    const res = await api.post('/api/auth/login', { name, password });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    set({ token, user, loading: false });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  fetchMe: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await api.get('/api/auth/me');
      set({ user: res.data, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null, loading: false });
    }
  },
}));
