'use strict';

const TYPE_PRIORITY: string[] = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
];
const TYPE_MAP: Record<string, string> = {
  object: 'OBJECT',
  array: 'ARRAY',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  null: 'NULL',
};

interface JsonSchema {
  type?: string | string[];
  nullable?: boolean;
  description?: string;
  format?: string;
  title?: string;
  pattern?: string;
  default?: unknown;
  example?: unknown;
  enum?: unknown[];
  required?: string[];
  propertyOrdering?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number | string;
  maxItems?: number | string;
  minLength?: number | string;
  maxLength?: number | string;
  minProperties?: number | string;
  maxProperties?: number | string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  [key: string]: unknown;
}

interface GeminiSchema {
  type?: string;
  nullable?: boolean;
  description?: string;
  format?: string;
  title?: string;
  pattern?: string;
  default?: unknown;
  example?: unknown;
  enum?: string[];
  required?: string[];
  propertyOrdering?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: string;
  maxItems?: string;
  minLength?: string;
  maxLength?: string;
  minProperties?: string;
  maxProperties?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  anyOf?: GeminiSchema[];
}

interface NormaliseTypeResult {
  type: string | null | undefined;
  nullable: boolean;
}

function normaliseType(
  value: string | string[] | undefined,
  schema?: JsonSchema
): NormaliseTypeResult {
  let nullable = Boolean(schema && schema.nullable);
  if (typeof value === 'string') {
    const low = value.toLowerCase();
    if (low === 'null') {
      nullable = true;
      return { type: null, nullable };
    }
    return { type: low, nullable };
  }

  if (Array.isArray(value)) {
    const seen: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const low = entry.toLowerCase();
      if (low === 'null') {
        nullable = true;
        continue;
      }
      if (!seen.includes(low)) seen.push(low);
    }
    let chosen: string | null = null;
    if (schema && schema.properties && seen.includes('object')) {
      chosen = 'object';
    } else if (schema && schema.items && seen.includes('array')) {
      chosen = 'array';
    } else {
      for (const candidate of TYPE_PRIORITY) {
        if (seen.includes(candidate)) {
          chosen = candidate;
          break;
        }
      }
    }
    if (!chosen && seen.length) chosen = seen[0] ?? null;
    return { type: chosen, nullable };
  }

  return {
    type: schema && schema.properties ? 'object' : schema && schema.items ? 'array' : undefined,
    nullable,
  };
}

function toGeminiSchema(schema: JsonSchema | null | undefined, depth = 0): GeminiSchema | null {
  if (!schema || typeof schema !== 'object') return null;
  if (depth > 20) return null; // prevent runaway recursion

  const out: GeminiSchema = {};
  const { type: rawType, nullable } = normaliseType(schema.type, schema);

  if (rawType && TYPE_MAP[rawType]) {
    out.type = TYPE_MAP[rawType];
  } else if (typeof rawType === 'string') {
    out.type = rawType.toUpperCase();
  }
  if (nullable) out.nullable = true;

  const textFields = ['description', 'format', 'title', 'pattern'] as const;
  for (const field of textFields) {
    const value = schema[field];
    if (typeof value === 'string' && value.trim()) {
      out[field] = value.trim();
    }
  }

  if ('default' in schema) out.default = schema.default;
  if ('example' in schema) out.example = schema.example;

  if (Array.isArray(schema.enum)) {
    const enumValues = schema.enum
      .map((value) => {
        if (value === null || value === undefined) return null;
        return typeof value === 'string' ? value : String(value);
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (enumValues.length) out.enum = enumValues;
  }

  if (Array.isArray(schema.required)) {
    const required = schema.required.filter((value) => typeof value === 'string' && value.trim());
    if (required.length) out.required = required;
  }

  if (Array.isArray(schema.propertyOrdering)) {
    const ordering = schema.propertyOrdering.filter(
      (value) => typeof value === 'string' && value.trim()
    );
    if (ordering.length) out.propertyOrdering = ordering;
  }

  const numericFields = ['minimum', 'maximum'] as const;
  for (const field of numericFields) {
    if (typeof schema[field] === 'number') {
      out[field] = schema[field] as number;
    }
  }

  const stringifiedNumericFields = [
    'minItems',
    'maxItems',
    'minLength',
    'maxLength',
    'minProperties',
    'maxProperties',
  ] as const;
  for (const field of stringifiedNumericFields) {
    const value = schema[field];
    if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
      out[field] = String(value).trim();
    }
  }

  const convertChild = (child: JsonSchema | null | undefined): GeminiSchema | null =>
    toGeminiSchema(child, depth + 1);

  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
  ) {
    const props: Record<string, GeminiSchema> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      const converted = convertChild(value);
      if (converted) props[key] = converted;
    }
    if (Object.keys(props).length) out.properties = props;
  }

  if (schema.items) {
    const source = Array.isArray(schema.items)
      ? schema.items.find((item): item is JsonSchema => item != null && typeof item === 'object')
      : schema.items;
    const converted = convertChild(source);
    if (converted) out.items = converted;
  }

  if (Array.isArray(schema.anyOf)) {
    const variants = schema.anyOf.map(convertChild).filter((v): v is GeminiSchema => v !== null);
    if (variants.length) out.anyOf = variants;
  }

  if (!out.type) {
    if (out.properties) out.type = TYPE_MAP.object;
    else if (out.items) out.type = TYPE_MAP.array;
    else out.type = TYPE_MAP.object;
  }

  return out;
}

module.exports = {
  toGeminiSchema,
};

export { toGeminiSchema };
