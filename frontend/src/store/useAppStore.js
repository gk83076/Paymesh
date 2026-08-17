import { create } from 'zustand'

export const useAppStore = create((set) => ({
  // Toast notifications
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { id: Date.now(), ...toast }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  // Last transfer result (for live flow visualizer)
  lastTransfer: null,
  setLastTransfer: (transfer) => set({ lastTransfer: transfer }),

  // Active transaction being watched
  watchedTransactionId: null,
  setWatchedTransactionId: (id) => set({ watchedTransactionId: id }),
}))
