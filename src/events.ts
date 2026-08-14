export const MUTATION_TOOLS = new Set(['write', 'edit'])
export const OBSERVED_TOOLS = new Set(['write', 'edit', 'read', 'bash', 'grep', 'glob'])

export interface NormalizedToolEvent {
  toolName: string
  input: Record<string, unknown>
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function resolveFilePath(input: Record<string, unknown>): string | undefined {
  return stringField(input.path)
    ?? stringField(input.file_path)
    ?? stringField(input.filePath)
}

/**
 * Map DeepSeek Harness tool arguments onto the host-neutral shape pi-lens
 * handlers already understand (`path`, `edits[].oldText`, …).
 */
export function normalizeToolInput(toolName: string, args: unknown): Record<string, unknown> {
  const input = asRecord(args)

  if (toolName === 'write') {
    return {
      ...input,
      path: resolveFilePath(input),
      content: typeof input.content === 'string' ? input.content : '',
    }
  }

  if (toolName === 'edit') {
    if (Array.isArray(input.edits)) {
      return {
        ...input,
        path: resolveFilePath(input),
        edits: input.edits,
      }
    }
    return {
      ...input,
      path: resolveFilePath(input),
      edits: [{
        oldText: stringField(input.old_string) ?? stringField(input.oldText) ?? '',
        newText: stringField(input.new_string) ?? stringField(input.newText) ?? '',
      }],
    }
  }

  if (toolName === 'read') {
    return {
      ...input,
      path: resolveFilePath(input),
      filePath: resolveFilePath(input),
      offset: input.offset,
      limit: input.limit,
    }
  }

  if (toolName === 'bash') {
    return {
      ...input,
      command: typeof input.command === 'string' ? input.command : '',
    }
  }

  if (toolName === 'grep' || toolName === 'glob') {
    return {
      ...input,
      path: resolveFilePath(input) ?? stringField(input.pattern),
    }
  }

  return {
    ...input,
    path: resolveFilePath(input) ?? input.path,
  }
}

export function normalizeToolEvent(toolName: string, args: unknown): NormalizedToolEvent {
  return {
    toolName,
    input: normalizeToolInput(toolName, args),
  }
}

export function extractResultText(value: unknown): string {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function joinFindingMessages(consumed: { messages: Array<{ content: string }> } | undefined): string | undefined {
  if (!consumed?.messages?.length) return undefined
  const text = consumed.messages.map(message => message.content).filter(Boolean).join('\n\n')
  return text.length > 0 ? text : undefined
}
