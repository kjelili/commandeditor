/**
 * CommandEditor Tauri Bridge
 * Connects the web frontend to native Rust capabilities
 */

import { invoke } from '@tauri-apps/api/tauri';
import { open, save } from '@tauri-apps/api/dialog';
import { readTextFile, writeTextFile, readDir } from '@tauri-apps/api/fs';
import { appWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';

export const TauriBridge = {
  // ─── File Operations ──────────────────────────────────────────────────────

  async openFileDialog(options = {}) {
    return await open({
      multiple: false,
      filters: [
        { name: 'PDF Documents', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      ...options
    });
  },

  async openMultipleFiles() {
    return await open({
      multiple: true,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });
  },

  async saveFileDialog(options = {}) {
    return await save({
      filters: [
        { name: 'PDF Document', extensions: ['pdf'] },
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
      ],
      ...options
    });
  },

  // ─── PDF Engine Commands ──────────────────────────────────────────────────

  async getMetadata(path) {
    return await invoke('get_pdf_metadata', { path });
  },

  async mergePDFs(paths, output) {
    return await invoke('merge_pdfs', { paths, output });
  },

  async splitPDF(path, pages, outputPattern) {
    return await invoke('split_pdf', { path, pages, outputPattern });
  },

  async compressPDF(path, output, quality = 'medium') {
    return await invoke('compress_pdf', { path, output, quality });
  },

  // ─── Redaction ────────────────────────────────────────────────────────────

  async applyRedaction(path, output, marks, verify = true) {
    return await invoke('apply_redaction', { path, output, marks, verify });
  },

  // ─── Watch Folders ────────────────────────────────────────────────────────

  async addWatchFolder(folderPath, outputFolder, action, pattern = '*.pdf', recursive = false) {
    return await invoke('add_watch_folder', {
      folderPath, outputFolder, action, pattern, recursive
    });
  },

  async listWatchFolders() {
    return await invoke('list_watch_folders');
  },

  async removeWatchFolder(id) {
    return await invoke('remove_watch_folder', { id });
  },

  // ─── Document Security ────────────────────────────────────────────────────

  async generateFingerprint(docId, recipient) {
    return await invoke('generate_fingerprint', { docId, recipient });
  },

  async verifyFingerprint(docId) {
    return await invoke('verify_fingerprint', { docId });
  },

  // ─── System Integration ───────────────────────────────────────────────────

  async getSystemInfo() {
    return await invoke('get_system_info');
  },

  async showNotification(title, body) {
    return await invoke('show_notification', { title, body });
  },

  // ─── Window Management ────────────────────────────────────────────────────

  async setWindowTitle(title) {
    await appWindow.setTitle(title);
  },

  async toggleFullscreen() {
    const isFullscreen = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!isFullscreen);
  },

  // ─── Event System ─────────────────────────────────────────────────────────

  onFileDropped(callback) {
    return listen('tauri://file-drop', (event) => {
      callback(event.payload);
    });
  },

  onWindowFocus(callback) {
    return listen('tauri://focus', callback);
  },

  emit(event, payload) {
    return emit(event, payload);
  },

  // ─── FS Helpers ───────────────────────────────────────────────────────────

  async readFile(path) {
    return await readTextFile(path);
  },

  async writeFile(path, contents) {
    return await writeTextFile(path, contents);
  },

  async readDirectory(path) {
    return await readDir(path);
  }
};

export default TauriBridge;
