import { create } from 'zustand';

/** "Are you sure?" — replaces the browser's plain confirm() with a dialog in the app's style. */
export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** Ask for a short name (new folder, rename folder…) with validation under the field. */
export interface TextPromptRequest {
  title: string;
  label: string;
  initial?: string;
  max: number;
  confirmLabel: string;
  onSubmit: (value: string) => Promise<unknown> | void;
}

/** App-wide dialogs that can be opened from anywhere (menus, rows…). */
interface DialogState {
  creditsTrackId: string | null;
  shortcuts: boolean;
  reportTrack: { id: string; title: string } | null;
  confirm: ConfirmRequest | null;
  textPrompt: TextPromptRequest | null;
  openCredits: (id: string | null) => void;
  openShortcuts: (open: boolean) => void;
  openReport: (track: { id: string; title: string } | null) => void;
  openConfirm: (request: ConfirmRequest | null) => void;
  openTextPrompt: (request: TextPromptRequest | null) => void;
}

export const useDialogs = create<DialogState>()((set) => ({
  creditsTrackId: null,
  shortcuts: false,
  reportTrack: null,
  confirm: null,
  textPrompt: null,
  openCredits: (creditsTrackId) => set({ creditsTrackId }),
  openShortcuts: (shortcuts) => set({ shortcuts }),
  openReport: (reportTrack) => set({ reportTrack }),
  openConfirm: (confirm) => set({ confirm }),
  openTextPrompt: (textPrompt) => set({ textPrompt }),
}));
