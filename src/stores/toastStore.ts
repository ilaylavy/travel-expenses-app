import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone) => string;
  dismiss: (id: string) => void;
}

// Cross-screen notification queue. Pushed toasts auto-dismiss after a
// short delay; ToastContainer (mounted once at the root layout) renders
// the visible stack. Lives in Zustand because the producer (a deeply
// nested form/modal) and the renderer (the root) don't share a closer
// boundary, and React Context would still require a Provider wrap.
const AUTO_DISMISS_MS = 3200;

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
};

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'success') => {
    const id = nextId();
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => {
      get().dismiss(id);
    }, AUTO_DISMISS_MS);
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Imperative helper for non-component callers (e.g. service-layer handlers).
export const pushToast = (message: string, tone: ToastTone = 'success'): string =>
  useToastStore.getState().push(message, tone);
