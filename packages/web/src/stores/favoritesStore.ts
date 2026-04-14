import { create } from 'zustand';
import api from '../api/client';

interface FavoritesState {
  ids: Set<string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isFavorited: (reviewId: string) => boolean;
  toggle: (reviewId: string) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: new Set(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const res = await api.get('/api/favorites/ids');
      set({ ids: new Set(res.data as string[]), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  isFavorited: (reviewId) => get().ids.has(reviewId),

  toggle: async (reviewId) => {
    const wasFavorited = get().ids.has(reviewId);
    // Optimistic update
    set(state => {
      const next = new Set(state.ids);
      if (wasFavorited) next.delete(reviewId);
      else next.add(reviewId);
      return { ids: next };
    });
    try {
      if (wasFavorited) {
        await api.delete(`/api/favorites/${reviewId}`);
      } else {
        await api.post(`/api/favorites/${reviewId}`);
      }
    } catch {
      // Revert on failure
      set(state => {
        const next = new Set(state.ids);
        if (wasFavorited) next.add(reviewId);
        else next.delete(reviewId);
        return { ids: next };
      });
    }
  },
}));
