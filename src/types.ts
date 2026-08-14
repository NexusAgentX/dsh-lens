/**
 * Projection-key home. Imported by host and client so SessionProjectionMap
 * merge is visible on both faces without pulling host-only modules.
 */

export interface LensBlocker {
  path: string
  line?: number
  rule?: string
  message: string
}

export interface LensFileStatus {
  path: string
  blocking: number
  errors: number
  warnings: number
  blockers: LensBlocker[]
}

export interface LensStatus {
  visible: boolean
  enabled: boolean
  languages: string[]
  blocking: number
  errors: number
  warnings: number
  files: LensFileStatus[]
  failedLsp: string[]
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Live pi-lens diagnostic footer, folded from widget-state on known session events. */
    lens: LensStatus
  }
}

export type { LensStatus as LensProjection }
