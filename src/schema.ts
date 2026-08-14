import { asRecord } from './events.js'

export type JsonSchemaNode = Record<string, unknown>

/**
 * TypeBox schemas are JSON Schema plus symbols. Strip those so dsh can
 * register the tool with a raw parameter schema.
 */
export function toJsonSchema(parameters: unknown): JsonSchemaNode {
  if (parameters === undefined || parameters === null) {
    return { type: 'object', additionalProperties: true }
  }
  try {
    const cloned = JSON.parse(JSON.stringify(parameters)) as unknown
    if (cloned !== null && typeof cloned === 'object' && !Array.isArray(cloned)) {
      const record = cloned as JsonSchemaNode
      if (record.type === undefined && record.properties === undefined) {
        return { type: 'object', additionalProperties: true, properties: record }
      }
      return record
    }
  } catch {
    // fall through
  }
  const record = asRecord(parameters)
  if (Object.keys(record).length === 0) {
    return { type: 'object', additionalProperties: true }
  }
  return { type: 'object', additionalProperties: true, properties: record }
}
