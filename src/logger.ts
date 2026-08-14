export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function envEnabled(): boolean {
  const value = process.env.DSH_LENS_DEBUG
  return value === '1' || value === 'true'
}

class Logger {
  private minLevel: LogLevel = envEnabled() ? 'debug' : 'info'

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  debug(message: string): void {
    if (LEVEL_PRIORITY.debug >= LEVEL_PRIORITY[this.minLevel]) console.debug(`[dsh-lens] ${message}`)
  }

  info(message: string): void {
    if (LEVEL_PRIORITY.info >= LEVEL_PRIORITY[this.minLevel]) console.info(`[dsh-lens] ${message}`)
  }

  warn(message: string): void {
    if (LEVEL_PRIORITY.warn >= LEVEL_PRIORITY[this.minLevel]) console.warn(`[dsh-lens] ${message}`)
  }

  error(message: string, error?: unknown): void {
    if (LEVEL_PRIORITY.error < LEVEL_PRIORITY[this.minLevel]) return
    if (error !== undefined) console.error(`[dsh-lens] ${message}`, error)
    else console.error(`[dsh-lens] ${message}`)
  }
}

export const logger = new Logger()
