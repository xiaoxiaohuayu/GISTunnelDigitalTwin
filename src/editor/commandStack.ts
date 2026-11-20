export interface EditorCommand<TState> {
  readonly id: string
  readonly label: string
  readonly timestamp: number
  readonly mergeKey?: string
  apply(state: TState): TState
  revert(state: TState): TState
  merge?(next: EditorCommand<TState>): EditorCommand<TState> | null
}

export interface CommandStackOptions {
  maxDepth?: number
  coalesceWindowMs?: number
}

export interface CommandHistoryEntry {
  id: string
  label: string
  timestamp: number
}

export interface CommandTransition<TState> {
  state: TState
  command: EditorCommand<TState>
}

export class CommandStack<TState> {
  private readonly maxDepth: number
  private readonly coalesceWindowMs: number
  private undoStack: EditorCommand<TState>[] = []
  private redoStack: EditorCommand<TState>[] = []
  private savedRevision = 0
  private revision = 0
  private revisionStack: number[] = [0]
  private redoRevisionStack: number[] = []

  constructor(options: CommandStackOptions = {}) {
    this.maxDepth = Math.max(1, options.maxDepth ?? 50)
    this.coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? 600)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoCount(): number {
    return this.undoStack.length
  }

  get redoCount(): number {
    return this.redoStack.length
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label
  }

  get isDirty(): boolean {
    return this.currentRevision !== this.savedRevision
  }

  get entries(): CommandHistoryEntry[] {
    return this.undoStack.map(({ id, label, timestamp }) => ({ id, label, timestamp }))
  }

  private get currentRevision(): number {
    return this.revisionStack.at(-1) ?? 0
  }

  execute(state: TState, command: EditorCommand<TState>): TState {
    const nextState = command.apply(state)
    const top = this.undoStack.at(-1)
    const canCoalesce =
      top !== undefined &&
      command.mergeKey !== undefined &&
      top.mergeKey === command.mergeKey &&
      command.timestamp - top.timestamp <= this.coalesceWindowMs &&
      typeof top.merge === 'function'

    this.redoStack = []
    this.redoRevisionStack = []

    if (canCoalesce) {
      const merged = top.merge!(command)
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged
        this.revision += 1
        this.revisionStack[this.revisionStack.length - 1] = this.revision
        return nextState
      }
    }

    this.undoStack.push(command)
    this.revision += 1
    this.revisionStack.push(this.revision)

    while (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
      this.revisionStack.shift()
    }

    return nextState
  }

  undo(state: TState): CommandTransition<TState> | null {
    const command = this.undoStack.pop()
    if (!command) return null
    const nextState = command.revert(state)
    this.redoStack.push(command)
    const poppedRevision = this.revisionStack.pop()
    if (poppedRevision !== undefined) this.redoRevisionStack.push(poppedRevision)
    return { state: nextState, command }
  }

  redo(state: TState): CommandTransition<TState> | null {
    const command = this.redoStack.pop()
    if (!command) return null
    const nextState = command.apply(state)
    this.undoStack.push(command)
    const restoredRevision = this.redoRevisionStack.pop()
    if (restoredRevision !== undefined) this.revisionStack.push(restoredRevision)
    return { state: nextState, command }
  }

  markSaved(): void {
    this.savedRevision = this.currentRevision
  }

  clear(markClean = true): void {
    this.undoStack = []
    this.redoStack = []
    this.redoRevisionStack = []
    this.revision += 1
    this.revisionStack = [this.revision]
    if (markClean) this.savedRevision = this.revision
  }
}
