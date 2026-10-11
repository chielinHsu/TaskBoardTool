export type BoardTask = {
  id: string
  title: string
  status: string
  priority: string
  tool: string
  model: string
  version: number
  errorText: string
  queued: boolean
  effort: string
  dependsOn: string[]
  plan: string
}

export type BoardApproval = {
  id: string
  tool: string
  title: string
  detail: string
}

export type BoardSnapshot = {
  status: 'idle' | 'ok' | 'error'
  error: string
  updatedAt: number
  activeId: string | null
  automatic: boolean
  codexConnected: boolean
  claudeAvailable: boolean
  codexSessions: number
  claudeSessions: number
  tasks: BoardTask[]
  projects: Record<string, string[]>
  approvals: BoardApproval[]
}

export type Draft = {
  open: boolean
  title: string
  description: string
  tool: string
  model: string
  priority: string
  status: string
  cwd: string
  project: string
  folderBusy?: boolean
}

export type ModelOption = { model: string; label: string }

declare module 'claude-code' {
  interface PluginState {
    'taskboard-pane': { snapshot: BoardSnapshot; draft: Draft; models: Record<string, ModelOption[]>; paneOpen: boolean }
  }
}
