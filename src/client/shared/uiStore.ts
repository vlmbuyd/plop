import { create } from 'zustand';

interface UiState {
  inboxOpen: boolean;

  profileOpen: boolean;

  importOpen: boolean;

  shortcutsOpen: boolean;

  /** 단축키로 입력창에 포커스를 줄 때마다 올라가는 번호. */
  focusInboxInput: number;

  focusChatInput: number;

  /** 잠깐 보여 주는 안내 문구. */
  notice: { id: number; text: string } | null;

  showNotice: (text: string) => void;

  clearNotice: () => void;

  setInboxOpen: (open: boolean) => void;

  setProfileOpen: (open: boolean) => void;

  setImportOpen: (open: boolean) => void;

  setShortcutsOpen: (open: boolean) => void;

  requestInboxInput: () => void;

  requestChatInput: () => void;
}

const INBOX_KEY = 'plop.inboxOpen';

function loadInboxOpen() {
  try {
    return localStorage.getItem(INBOX_KEY) !== 'false';
  } catch {
    return true;
  }
}

export const useUiStore = create<UiState>((set) => ({
  inboxOpen: loadInboxOpen(),
  profileOpen: false,
  importOpen: false,
  shortcutsOpen: false,
  focusInboxInput: 0,
  focusChatInput: 0,
  notice: null,
  showNotice: (text) => set((s) => ({ notice: { id: (s.notice?.id ?? 0) + 1, text } })),
  clearNotice: () => set({ notice: null }),
  setInboxOpen: (open) => {
    try {
      localStorage.setItem(INBOX_KEY, String(open));
    } catch {
      // 기억하지 못해도 동작은 같다.
    }
    set({ inboxOpen: open });
  },
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  requestInboxInput: () => set((s) => ({ inboxOpen: true, focusInboxInput: s.focusInboxInput + 1 })),
  requestChatInput: () => set((s) => ({ focusChatInput: s.focusChatInput + 1 })),
}));
