'use client'

/**
 * Plugin Manager — exposes the CommandEditor Plugin SDK (lib/plugin-sdk.js)
 * on window.CommandEditorPluginSDK so third-party scripts can register,
 * lists active plugins, and runs their commands. Ships with a bundled
 * hello-world example so the flow is testable without external code.
 */

import React, { useState, useEffect, useRef } from 'react'
import { PluginSDK } from '@/lib/plugin-sdk'

interface Props {
  onClose: () => void
  showStatus: (msg: string, dur?: number) => void
}

/** Build the core API surface the SDK expects, backed by browser primitives. */
function buildCoreAPI(showStatus: (msg: string, dur?: number) => void) {
  const commandRegistry = new Map<string, { handler: Function; options: any }>()
  const eventBus = new EventTarget()
  return {
    commands: {
      register: (id: string, handler: Function, options: any = {}) => { commandRegistry.set(id, { handler, options }) },
      unregister: (id: string) => { commandRegistry.delete(id) },
      execute: (id: string, ...args: any[]) => {
        const cmd = commandRegistry.get(id)
        if (!cmd) throw new Error(`Unknown command: ${id}`)
        return cmd.handler(...args)
      },
      list: () => Array.from(commandRegistry.entries()).map(([id, c]) => ({ id, plugin: c.options?.plugin })),
    },
    ui: {
      registerPanel: (_id: string, _config: any) => {},
      unregisterPanel: (_id: string) => {},
    },
    tools: {
      register: (_id: string, _config: any) => {},
      unregister: (_id: string) => {},
    },
    dialogs: {
      showMessage: (msg: string) => { showStatus(String(msg)); return Promise.resolve() },
      showInput: (prompt: string, def = '') => Promise.resolve(window.prompt(prompt, def)),
      showFilePicker: () => Promise.resolve(null),
    },
    pdf: {
      // Wired to the live document via window hooks set by the main page
      getActiveDocument: () => (window as any).__ceActiveDocument || null,
      getPage: (_n: number) => null,
      addAnnotation: () => { throw new Error('addAnnotation: use the Annotation Layers tool') },
      modifyContent: () => { throw new Error('modifyContent not available to plugins yet') },
    },
    events: { on: (event: string, cb: EventListener) => { eventBus.addEventListener(event, cb); return () => eventBus.removeEventListener(event, cb) } },
    storage: {
      get: (k: string) => { try { return JSON.parse(localStorage.getItem('ce-plugin:' + k) || 'null') } catch { return null } },
      set: (k: string, v: any) => localStorage.setItem('ce-plugin:' + k, JSON.stringify(v)),
      remove: (k: string) => localStorage.removeItem('ce-plugin:' + k),
      clear: () => Object.keys(localStorage).filter(k => k.startsWith('ce-plugin:')).forEach(k => localStorage.removeItem(k)),
    },
    settings: { register: (_k: string, _c: any) => {}, get: (_k: string) => undefined },
    http: { request: (url: string, options: any) => fetch(url, options) },
  }
}

export default function PluginManagerTool({ onClose, showStatus }: Props) {
  const [, force] = useState(0)
  const rerender = () => force(n => n + 1)
  const [showDocs, setShowDocs] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [pluginUrl, setPluginUrl] = useState('')
  const sdkRef = useRef<any>(null)
  // Curated, bundled registry — see lib/plugin-marketplace.js
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const marketplace: any[] = (require('@/lib/plugin-marketplace') as any).MARKETPLACE_PLUGINS || []

  const installFromUrl = async () => {
    const url = pluginUrl.trim()
    if (!url) return
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const code = await res.text()
      const mod = { exports: {} as any }
      new Function('module', 'exports', code)(mod, mod.exports)
      await sdkRef.current.register(mod.exports.default || mod.exports)
      // Remember URL so team configs can reinstall it
      const urls = JSON.parse(localStorage.getItem('ce-plugin-urls') || '[]')
      if (!urls.includes(url)) localStorage.setItem('ce-plugin-urls', JSON.stringify([...urls, url]))
      rerender(); showStatus('✓ Plugin installed from URL')
    } catch (e: any) { showStatus('Install failed: ' + e.message) }
  }

  const exportConfig = () => {
    const cfg = {
      standard: 'ce-plugin-config-1',
      plugins: plugins.map((p: any) => p.id),
      urls: JSON.parse(localStorage.getItem('ce-plugin-urls') || '[]'),
    }
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'commandeditor-plugins.json'; a.click()
    showStatus('✓ Config exported — share it with your team')
  }

  const importConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const cfg = JSON.parse(await file.text())
      // Bundled plugins by id
      for (const id of cfg.plugins || []) {
        const entry = marketplace.find((m: any) => m.id === id)
        if (entry && !plugins.some((p: any) => p.id === id)) await sdkRef.current.register(entry.module)
      }
      // URL plugins
      for (const url of cfg.urls || []) {
        const res = await fetch(url); const code = await res.text()
        const mod = { exports: {} as any }
        new Function('module', 'exports', code)(mod, mod.exports)
        await sdkRef.current.register(mod.exports.default || mod.exports)
      }
      localStorage.setItem('ce-plugin-urls', JSON.stringify(cfg.urls || []))
      rerender(); showStatus('✓ Team plugin config applied')
    } catch (err: any) { showStatus('Import failed: ' + err.message) }
    e.target.value = ''
  }

  useEffect(() => {
    const w = window as any
    if (!w.CommandEditorPluginSDK) {
      w.CommandEditorPluginSDK = new PluginSDK(buildCoreAPI(showStatus))
    }
    sdkRef.current = w.CommandEditorPluginSDK
    rerender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadExample = async () => {
    try {
      const example: any = await import('@/lib/plugin-examples/index.js')
      await sdkRef.current.register(example.default || example)
      rerender(); showStatus('✓ Example plugin registered — try its command below')
    } catch (e: any) { showStatus('Failed: ' + e.message) }
  }

  const sdk = sdkRef.current
  const plugins: any[] = sdk ? sdk.getActivePlugins() : []
  const allCommands: Array<{ id: string; plugin?: string }> = sdk ? sdk.core.commands.list() : []

  return (
    <div className="card space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div><p className="font-semibold text-sm">🔌 Plugin Manager</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Third-party extension API. Plugins run in your browser with the same zero-knowledge guarantee.</p></div>
        <button onClick={onClose} className="btn-ghost text-xs">✕ Close</button>
      </div>

      {plugins.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No plugins registered yet. Load the bundled example, or register your own from the console.</p>
      ) : (
        <div className="space-y-2">
          {plugins.map((p: any) => {
            const cmds = allCommands.filter(c => c.plugin === p.id)
            return (
              <div key={p.id} className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>v{p.version}{p.author ? ` · ${p.author}` : ''}</span>
                  <button onClick={async () => { await sdk.unregister(p.id); rerender(); showStatus('Plugin removed') }} className="btn-ghost text-xs ml-auto">Unregister</button>
                </div>
                {p.description && <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{p.description}</p>}
                {cmds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cmds.map(cmd => (
                      <button key={cmd.id} onClick={async () => { try { await sdk.executeCommand(cmd.id) } catch (e: any) { showStatus(e.message) } }}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                        ▶ {cmd.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={loadExample} className="btn-primary text-sm">Load example plugin</button>
        <button onClick={() => setShowDocs(s => !s)} className="btn-ghost text-sm">{showDocs ? 'Hide' : 'Show'} developer docs</button>
        <button onClick={() => setShowMarket(s => !s)} className="btn-ghost text-sm">{showMarket ? 'Hide' : '🏪'} Marketplace</button>
      </div>

      {/* ── v10: Plugin Marketplace ───────────────────────────────────────── */}
      {showMarket && (
        <div className="space-y-2 p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs font-semibold">🏪 Marketplace — curated plugins, one-click install, zero servers</p>
          {marketplace.map((entry: any) => {
            const installed = plugins.some((p: any) => p.id === entry.id)
            return (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.module.manifest.name} <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>v{entry.module.manifest.version}</span></p>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{entry.tagline}</p>
                </div>
                <button
                  disabled={installed}
                  onClick={async () => {
                    try { await sdkRef.current.register(entry.module); rerender(); showStatus(`✓ ${entry.module.manifest.name} installed`) }
                    catch (e: any) { showStatus('Install failed: ' + e.message) }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={installed ? { background: 'var(--surface)', color: 'var(--ink-muted)' } : { background: 'var(--accent)', color: 'white' }}
                >
                  {installed ? '✓ Installed' : 'Install'}
                </button>
              </div>
            )
          })}
          {/* Install by URL — third parties host a plugin .js anywhere */}
          <div className="flex gap-2 pt-1">
            <input value={pluginUrl} onChange={e => setPluginUrl(e.target.value)} placeholder="https://example.com/my-plugin.js"
                   className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                   style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
            <button onClick={installFromUrl} className="text-xs px-3 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--accent)', color: 'white' }}>Install URL</button>
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            URL plugins execute with page privileges — only install code you trust (read the source first).
          </p>
          {/* Shared config: export/import the installed set for team rollouts */}
          <div className="flex gap-2 pt-1">
            <button onClick={exportConfig} className="btn-ghost text-xs">⬇ Export plugin config</button>
            <label className="btn-ghost text-xs cursor-pointer">
              ⬆ Import config
              <input type="file" accept=".json" className="hidden" onChange={importConfig} />
            </label>
          </div>
        </div>
      )}

      {showDocs && (
        <div className="text-xs space-y-2 p-3 rounded-xl font-mono whitespace-pre-wrap" style={{ background: 'var(--surface-2)' }}>
{`// Register a plugin from the browser console or your own script:
window.CommandEditorPluginSDK.register({
  manifest: { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', main: 'index.js' },
  activate(context) {
    const cmd = context.api.registerCommand('hello', () =>
      context.api.showMessage('Hello from my plugin!'));
    context.push(cmd);
  }
});

// Manifest schema: lib/plugin-manifest-schema.json
// Full API surface: lib/plugin-sdk.js (commands, panels, events, storage, settings)`}
        </div>
      )}
    </div>
  )
}
