import { reactive } from "vue";

interface Pending {
  text: string;
  ok: string;
  cancel: string;
  input: null | { password: boolean; value: string };
  danger: boolean;
  resolve: (v: string | boolean | null) => void;
}

export const dialog = reactive({ current: null as Pending | null });

export function confirmDialog(text: string, ok: string, cancel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.current = { text, ok, cancel, input: null, danger, resolve: (v) => resolve(v === true) };
  });
}

export function askDialog(text: string, ok: string, cancel: string, password = true, initial = ""): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.current = { text, ok, cancel, input: { password, value: initial }, danger: false, resolve: (v) => resolve(typeof v === "string" ? v : null) };
  });
}

export function closeDialog(v: string | boolean | null) {
  const c = dialog.current;
  dialog.current = null;
  c?.resolve(v);
}
