import { invoke } from '@tauri-apps/api/tauri';

export interface TauriBridge {
  resolveFile(name: string, location: string): Promise<string>;
  readFileBytes(path: string): Promise<number[]>;
  writeTempFile(bytes: number[], name: string): Promise<string>;
  listFolder(location: string): Promise<string[]>;
  printFile(path: string): Promise<void>;
  composeEmail(to: string, subject: string, body: string, attachment: string): Promise<void>;
  getSystemInfo(): Promise<Record<string, string>>;
  showNotification(title: string, body: string): Promise<void>;
}

export const tauriBridge: TauriBridge = {
  resolveFile: (name, location) => invoke('resolve_file', { name, location }),
  readFileBytes: (path) => invoke('read_file_bytes', { path }),
  writeTempFile: (bytes, name) => invoke('write_temp_file', { bytes, name }),
  listFolder: (location) => invoke('list_folder', { location }),
  printFile: (path) => invoke('print_file', { path }),
  composeEmail: (to, subject, body, attachment) =>
    invoke('compose_email', { to, subject, body, attachment }),
  getSystemInfo: () => invoke('get_system_info'),
  showNotification: (title, body) => invoke('show_notification', { title, body }),
};

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}