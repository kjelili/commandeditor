'use client';

/**
 * CloudConnector - OAuth-based cloud storage integration
 * Client-side file fetch and save. Zero-knowledge preserved.
 * 
 * Supports: Google Drive, Dropbox, OneDrive
 * Integration: Add to upload area and download flow
 */

import React, { useState, useEffect } from 'react';
import type { CloudProvider, CloudFile, CloudAuthState } from '../types';

interface Props {
  onFileSelect: (bytes: Uint8Array, name: string) => void;
  onSaveToCloud?: (bytes: Uint8Array, name: string, provider: CloudProvider) => void;
  mode: 'import' | 'export';
}

const PROVIDERS: { id: CloudProvider; name: string; icon: string; color: string }[] = [
  { id: 'google_drive', name: 'Google Drive', icon: '📁', color: '#4285f4' },
  { id: 'dropbox', name: 'Dropbox', icon: '📦', color: '#0061ff' },
  { id: 'onedrive', name: 'OneDrive', icon: '☁️', color: '#0078d4' },
];

export const CloudConnector: React.FC<Props> = ({ onFileSelect, onSaveToCloud, mode }) => {
  const [authStates, setAuthStates] = useState<Record<CloudProvider, CloudAuthState | null>>({
    google_drive: null,
    dropbox: null,
    onedrive: null,
    box: null,
  });
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('root');
  const [searchQuery, setSearchQuery] = useState('');

  // Load auth states from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('commandeditor_cloud_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Check if tokens are expired
        const now = Date.now();
        const valid: Record<CloudProvider, CloudAuthState | null> = {
          google_drive: null,
          dropbox: null,
          onedrive: null,
          box: null,
        };
        Object.entries(parsed).forEach(([key, value]) => {
          const state = value as CloudAuthState;
          if (state.expiresAt > now) {
            valid[key as CloudProvider] = state;
          }
        });
        setAuthStates(valid);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const saveAuthState = (provider: CloudProvider, state: CloudAuthState) => {
    const updated = { ...authStates, [provider]: state };
    setAuthStates(updated);
    localStorage.setItem('commandeditor_cloud_auth', JSON.stringify(updated));
  };

  // ===== GOOGLE DRIVE =====
  const authGoogleDrive = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const redirectUri = `${window.location.origin}/api/auth/google/callback`;
    const scope = 'https://www.googleapis.com/auth/drive.file';

    const state = btoa(JSON.stringify({ provider: 'google_drive', nonce: Math.random() }));

    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}&` +
      `prompt=consent`;

    // For pure client-side without backend, use popup + postMessage
    const popup = window.open(url, 'google_auth', 'width=500,height=600');

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth_callback' && event.data.provider === 'google_drive') {
        const authState: CloudAuthState = {
          provider: 'google_drive',
          accessToken: event.data.access_token,
          expiresAt: Date.now() + (event.data.expires_in * 1000),
          scope: [scope],
        };
        saveAuthState('google_drive', authState);
        popup?.close();
      }
    }, { once: true });
  };

  const listGoogleDriveFiles = async (folderId: string = 'root') => {
    const auth = authStates.google_drive;
    if (!auth) return;

    setIsLoading(true);
    try {
      const query = searchQuery 
        ? `name contains '${searchQuery}' and mimeType='application/pdf'`
        : `mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder'`;

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&` +
        `fields=files(id,name,mimeType,size,modifiedTime)&` +
        `pageSize=50`,
        { headers: { Authorization: `Bearer ${auth.accessToken}` } }
      );

      const data = await response.json();
      const mapped: CloudFile[] = data.files.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: parseInt(f.size) || 0,
        modifiedTime: f.modifiedTime,
        provider: 'google_drive',
      }));

      setFiles(mapped);
    } catch (error) {
      console.error('Failed to list files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFromGoogleDrive = async (fileId: string, name: string) => {
    const auth = authStates.google_drive;
    if (!auth) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${auth.accessToken}` } }
      );

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      onFileSelect(new Uint8Array(arrayBuffer), name);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
    } finally {
      setIsLoading(false);
    }
  };

  // Google File Picker — the sanctioned way to browse files under the
  // privacy-preserving drive.file scope (which cannot list existing files).
  // Requires a Google API key (NEXT_PUBLIC_GOOGLE_API_KEY) + the Picker API.
  const openGooglePicker = async () => {
    const auth = authStates.google_drive;
    if (!auth) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';
    if (!apiKey) {
      alert('Google Picker needs an API key. Add NEXT_PUBLIC_GOOGLE_API_KEY (from Google Cloud Console → Credentials → API key) and enable the "Google Picker API".');
      return;
    }
    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const el = document.createElement('script');
      el.src = src; el.onload = () => resolve(); el.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(el);
    });
    try {
      await loadScript('https://apis.google.com/js/api.js');
      await new Promise<void>((resolve) => (window as any).gapi.load('picker', { callback: () => resolve() }));
      const g = (window as any).google;
      const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setMode(g.picker.DocsViewMode.LIST);
      const picker = new g.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(auth.accessToken)
        .setDeveloperKey(apiKey)
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .setTitle('Select a PDF from Google Drive')
        .setCallback((data: any) => {
          if (data.action === g.picker.Action.PICKED && data.docs?.length) {
            const doc = data.docs[0];
            downloadFromGoogleDrive(doc.id, doc.name);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e: any) {
      console.error('Picker error:', e);
      alert('Could not open Google Picker: ' + e.message);
    }
  };

  const uploadToGoogleDrive = async (bytes: Uint8Array, name: string) => {
    const auth = authStates.google_drive;
    if (!auth) return;

    setIsLoading(true);
    try {
      const metadata = { name, mimeType: 'application/pdf' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }));

      await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          body: form,
        }
      );

      alert('File saved to Google Drive!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== DROPBOX =====
  const authDropbox = () => {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID || '';
    const redirectUri = `${window.location.origin}/api/auth/dropbox/callback`;

    // Implicit token flow returns a short-lived (~4h) access token in the URL
    // fragment. token_access_type=offline is only valid for the auth-code flow
    // (response_type=code) and Dropbox rejects it here — so it must be omitted.
    const url = `https://www.dropbox.com/oauth2/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token`;

    const popup = window.open(url, 'dropbox_auth', 'width=500,height=600');

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth_callback' && event.data.provider === 'dropbox') {
        const authState: CloudAuthState = {
          provider: 'dropbox',
          accessToken: event.data.access_token,
          expiresAt: Date.now() + (4 * 60 * 60 * 1000), // Dropbox tokens are 4 hours
          scope: ['files.content.read', 'files.content.write'],
        };
        saveAuthState('dropbox', authState);
        popup?.close();
      }
    }, { once: true });
  };

  const listDropboxFiles = async (path: string = '') => {
    const auth = authStates.dropbox;
    if (!auth) return;

    setIsLoading(true);
    try {
      // Recursive listing so PDFs in sub-folders are found — not just the root.
      const collected: any[] = [];
      let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, recursive: true, limit: 2000 }),
      });
      let data = await res.json();
      collected.push(...(data.entries || []));
      let pages = 0;
      while (data.has_more && data.cursor && pages < 10) {
        res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor: data.cursor }),
        });
        data = await res.json();
        collected.push(...(data.entries || []));
        pages++;
      }

      const mapped: CloudFile[] = collected
        .filter((f: any) => f['.tag'] === 'file' && f.name.toLowerCase().endsWith('.pdf'))
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: 'application/pdf',
          size: f.size,
          modifiedTime: f.server_modified,
          provider: 'dropbox' as CloudProvider,
        }))
        .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());

      setFiles(mapped);
    } catch (error) {
      console.error('Failed to list files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── OneDrive (Microsoft Graph) listing + download ──────────────────────────
  const listOneDriveFiles = async () => {
    const auth = authStates.onedrive;
    if (!auth) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.pdf')?$top=50&$select=id,name,size,lastModifiedDateTime",
        { headers: { Authorization: `Bearer ${auth.accessToken}` } }
      );
      const data = await res.json();
      const mapped: CloudFile[] = (data.value || [])
        .filter((f: any) => f.name?.toLowerCase().endsWith('.pdf'))
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: 'application/pdf',
          size: f.size || 0,
          modifiedTime: f.lastModifiedDateTime,
          provider: 'onedrive' as CloudProvider,
        }));
      setFiles(mapped);
    } catch (error) {
      console.error('Failed to list OneDrive files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFromOneDrive = async (fileId: string, name: string) => {
    const auth = authStates.onedrive;
    if (!auth) return;
    setIsLoading(true);
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const arrayBuffer = await (await res.blob()).arrayBuffer();
      onFileSelect(new Uint8Array(arrayBuffer), name);
    } catch (error) {
      console.error('OneDrive download failed:', error);
      alert('Failed to download file');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFromDropbox = async (path: string, name: string) => {
    const auth = authStates.dropbox;
    if (!auth) return;

    setIsLoading(true);
    try {
      const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path }),
        },
      });

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      onFileSelect(new Uint8Array(arrayBuffer), name);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== ONEDRIVE =====
  const authOneDrive = () => {
    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID || '';
    const redirectUri = `${window.location.origin}/api/auth/onedrive/callback`;
    const scope = 'files.readwrite';

    // Use the /consumers endpoint so sign-in is scoped to personal Microsoft
    // accounts (personal OneDrive). This avoids AADSTS700016 when a user is
    // signed into an org tenant (e.g. a university) that doesn't have the app.
    // If org/work OneDrive is needed later, register the app as multi-tenant
    // and switch this back to /common.
    const url = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scope)}`;

    const popup = window.open(url, 'onedrive_auth', 'width=500,height=600');

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth_callback' && event.data.provider === 'onedrive') {
        const authState: CloudAuthState = {
          provider: 'onedrive',
          accessToken: event.data.access_token,
          expiresAt: Date.now() + (event.data.expires_in * 1000),
          scope: [scope],
        };
        saveAuthState('onedrive', authState);
        popup?.close();
      }
    }, { once: true });
  };

  // Provider selection handler
  const handleProviderSelect = (provider: CloudProvider) => {
    setSelectedProvider(provider);
    if (!authStates[provider]) {
      if (provider === 'google_drive') authGoogleDrive();
      else if (provider === 'dropbox') authDropbox();
      else if (provider === 'onedrive') authOneDrive();
    } else {
      // Already authenticated, list files
      if (provider === 'google_drive') listGoogleDriveFiles();
      else if (provider === 'dropbox') listDropboxFiles();
      else if (provider === 'onedrive') listOneDriveFiles();
    }
  };

  const handleFileClick = (file: CloudFile) => {
    if (mode === 'import') {
      if (file.provider === 'google_drive') downloadFromGoogleDrive(file.id, file.name);
      else if (file.provider === 'dropbox') downloadFromDropbox(file.id, file.name);
      else if (file.provider === 'onedrive') downloadFromOneDrive(file.id, file.name);
    }
  };

  const handleSave = (provider: CloudProvider) => {
    // This would be called from parent with the processed file bytes
    if (onSaveToCloud) {
      // onSaveToCloud would need to be wired up with actual bytes
    }
  };

  const displayedFiles = searchQuery
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h3 style={{ marginBottom: '16px' }}>
        {mode === 'import' ? 'Open from Cloud' : 'Save to Cloud'}
      </h3>

      {/* Provider selection */}
      {!selectedProvider && (
        <div style={{ display: 'flex', gap: '12px' }}>
          {PROVIDERS.map(provider => (
            <button
              key={provider.id}
              onClick={() => handleProviderSelect(provider.id)}
              style={{
                flex: 1,
                padding: '20px',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = provider.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: '32px' }}>{provider.icon}</span>
              <span style={{ fontWeight: 500, fontSize: '14px' }}>{provider.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* File browser */}
      {selectedProvider && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button 
              onClick={() => setSelectedProvider(null)}
              style={{ ...btnStyle, padding: '6px 12px', fontSize: '13px' }}
            >
              ← Back
            </button>
            <span style={{ fontWeight: 500 }}>
              {PROVIDERS.find(p => p.id === selectedProvider)?.name}
            </span>
            {authStates[selectedProvider] && (
              <span style={{ fontSize: '12px', color: '#22c55e' }}>● Connected</span>
            )}
          </div>

          {mode === 'import' && (
            <>
              {selectedProvider === 'google_drive' && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    For your privacy, Google only shares files you explicitly choose. Click below to pick PDFs from your Drive.
                  </p>
                  <button type="button" onClick={openGooglePicker} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    📂 Browse Google Drive…
                  </button>
                </div>
              )}
              {selectedProvider === 'dropbox' && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                  Showing PDFs from across your Dropbox. If this stays empty, your Dropbox app may be limited to its own &ldquo;App folder&rdquo;.
                </p>
              )}
              {selectedProvider === 'onedrive' && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                  Searching your OneDrive for PDF files.
                </p>
              )}
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && selectedProvider === 'google_drive') listGoogleDriveFiles() }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  marginBottom: '12px',
                }}
              />

              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  Loading files...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {displayedFiles.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                      {selectedProvider === 'google_drive'
                        ? 'Use “Browse Google Drive…” above to pick a PDF.'
                        : searchQuery ? 'No matching PDF files' : 'No PDF files found'}
                    </div>
                  )}
                  {displayedFiles.map(file => (
                    <button
                      key={file.id}
                      onClick={() => handleFileClick(file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {(file.size / 1024 / 1024).toFixed(2)} MB • {new Date(file.modifiedTime).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'export' && authStates[selectedProvider] && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: '#6b7280', marginBottom: '16px' }}>
                Ready to save to {PROVIDERS.find(p => p.id === selectedProvider)?.name}
              </p>
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                This will be triggered automatically after processing.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  background: 'white',
  fontSize: '14px',
  cursor: 'pointer',
};
