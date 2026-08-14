import { asRecord } from './events.js'

export type JsonSchemaNode = Record<string, unknown>

const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

/** Output shape returned by wrapPiTool. `details` is unconstrained JSON. */
export const TOOL_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    details: { description: 'Opaque upstream tool details.' },
  },
  required: ['text'],
}

/**
 * Project a TypeBox / JSON Schema value onto the subset dsh `tools.register`
 * accepts: type/oneOf/properties/required/additionalProperties/items/enum/const
 * plus description/title/default/examples.
 */
export function toJsonSchema(parameters: unknown): JsonSchemaNode {
  const cloned = cloneJson(parameters)
  if (cloned === undefined) return { type: 'object', additionalProperties: true }
  const normalized = normalizeNode(cloned)
  if (normalized.type === 'object' || normalized.oneOf || normalized.properties) return normalized
  return { type: 'object', additionalProperties: true }
}

function cloneJson(value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    const record = asRecord(value)
    return Object.keys(record).length === 0 ? undefined : record
  }
}

function normalizeNode(value: unknown): JsonSchemaNode {
  if (!isRecord(value)) return { type: 'object', additionalProperties: true }

  let node: JsonSchemaNode = value
  const description = typeof node.description === 'string' ? node.description : undefined
  const title = typeof node.title === 'string' ? node.title : undefined
  const branches = collectBranches(node)
  if (branches) {
    const oneOf = branches.map(normalizeNode).filter(branch => Object.keys(branch).length > 0)
    if (oneOf.length === 1) return annotate(oneOf[0]!, description, title)
    if (oneOf.length >= 2) return annotate({ oneOf }, description, title)
  }

  if (Array.isArray(node.type)) {
    const types = node.type.filter((type): type is string => typeof type === 'string' && SCHEMA_TYPES.has(type))
    if (types.length >= 2) {
      return annotate({
        oneOf: types.map(type => normalizeNode({ ...node, type })),
      }, description, title)
    }
    if (types.length === 1) node = { ...node, type: types[0] }
    else {
      const rest = { ...node }
      delete rest.type
      node = rest
    }
  }

  const out: JsonSchemaNode = {}
  if (typeof node.type === 'string' && SCHEMA_TYPES.has(node.type)) out.type = node.type
  copyAnnotation(out, 'description', description)
  copyAnnotation(out, 'title', title)
  if (node.default !== undefined && isJsonValue(node.default)) out.default = node.default
  if (Array.isArray(node.examples) && node.examples.every(isJsonValue)) out.examples = node.examples

  if (isRecord(node.properties)) {
    out.type = 'object'
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, child]) => [key, normalizeNode(child)]),
    )
  }
  if (out.type === 'object' && Array.isArray(node.required)) {
    const required = node.required.filter((key): key is string => typeof key === 'string')
    if (required.length > 0) out.required = required
  }
  if (out.type === 'object' && typeof node.additionalProperties === 'boolean') {
    out.additionalProperties = node.additionalProperties
  }

  if (node.items !== undefined) {
    out.type = out.type ?? 'array'
    if (out.type === 'array') out.items = normalizeNode(node.items)
  }

  if (Array.isArray(node.enum) && node.enum.length > 0 && node.enum.every(isJsonValue)) {
    out.enum = node.enum
  }
  if (node.const !== undefined && isJsonValue(node.const)) out.const = node.const

  if (!out.type && !out.oneOf) {
    if (out.properties) out.type = 'object'
    else return annotate({ type: 'object', additionalProperties: true }, description, title)
  }
  return out
}

function collectBranches(value: JsonSchemaNode): unknown[] | undefined {
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const items = value[key]
    if (Array.isArray(items) && items.length > 0) return items
  }
  return undefined
}

function annotate(node: JsonSchemaNode, description?: string, title?: string): JsonSchemaNode {
  copyAnnotation(node, 'description', description)
  copyAnnotation(node, 'title', title)
  return node
}

function copyAnnotation(node: JsonSchemaNode, key: 'description' | 'title', value: string | undefined): void {
  if (value !== undefined && node[key] === undefined) node[key] = value
}

function isRecord(value: unknown): value is JsonSchemaNode {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isJsonValue(value: unknown): boolean {
  try {
    JSON.stringify(value)
    return value !== undefined
  } catch {
    return false
  }
}
