// history.ts — processing history & undo stack

export interface HistoryEntry {
  id: string
  toolId: string
  toolName: string
  blob: Blob
  originalSize: number
  processedSize: number
  timestamp: number
  filename: string
}

const MAX = 5

export class ProcessingHistory {
  private items: HistoryEntry[] = []

  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
    const full = { ...entry, id: Math.random().toString(36).slice(2), timestamp: Date.now() }
    this.items.unshift(full)
    if (this.items.length > MAX) this.items = this.items.slice(0, MAX)
    return full
  }

  getAll(): HistoryEntry[] { return [...this.items] }
  getLast(): HistoryEntry | null { return this.items[0] ?? null }
  canUndo(): boolean { return this.items.length > 1 }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null
    this.items.shift()
    return this.items[0]
  }

  clear(): void { this.items = [] }
  get length() { return this.items.length }
}
