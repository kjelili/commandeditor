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
  const sdkRef = useRef<any>(null)

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
      </div>

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
