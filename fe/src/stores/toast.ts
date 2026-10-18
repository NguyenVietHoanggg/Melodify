import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  imageUrl?: string | null;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, extra?: Omit<Toast, 'id' | 'message'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, extra) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, ...extra }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, extra?: Omit<Toast, 'id' | 'message'>) => useToasts.getState().show(message, extra);
