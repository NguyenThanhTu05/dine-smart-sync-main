export type Schema = {
  type: string;
  enum?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  items?: Schema;
};
export type InferSchema<S> = S extends { enum: readonly (infer E)[] } ? E
  : S extends { type: 'string' } ? string
  : S extends { type: 'number' } ? number
  : S extends { type: 'boolean' } ? boolean
  : S extends { type: 'array'; items: infer I } ? InferSchema<I>[]
  : S extends { properties: infer P extends Record<string, unknown> }
    ? { -readonly [K in keyof P as K extends (S extends { required: readonly (infer R)[] } ? R : never) ? K : never]: InferSchema<P[K]> }
      & { -readonly [K in keyof P as K extends (S extends { required: readonly (infer R)[] } ? R : never) ? never : K]?: InferSchema<P[K]> }
    : never;

export function validateArguments(schema: Schema, value: unknown, path = 'arguments'): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: cần object`);
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) throw new Error(`${path}.${key}: thiếu dữ liệu`);
    for (const [key, entry] of Object.entries(record)) {
      const child = schema.properties?.[key];
      if (!child) throw new Error(`${path}.${key}: trường không hợp lệ`);
      validateArguments(child, entry, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || !schema.items) throw new Error(`${path}: cần array`);
    for (const entry of value) validateArguments(schema.items, entry, path);
  } else if (typeof value !== schema.type || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error(`${path}: sai kiểu dữ liệu`);
  } else if (schema.enum && !schema.enum.includes(String(value))) {
    throw new Error(`${path}: giá trị không hợp lệ`);
  }
}

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatMessage = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
export function parseMessages(body: unknown): ChatMessage[] {
  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages)) throw new Error('Tin nhắn không hợp lệ');
  if (body.messages.length > 100) throw new Error('Hội thoại quá dài');
  return body.messages.map(message => {
    if (!message || typeof message !== 'object' || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 20000) throw new Error('Tin nhắn không hợp lệ');
    return { role: message.role, content: message.content };
  });
}
export function parseAssistantResponse(body: unknown): ChatMessage {
  if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) throw new Error('AI trả dữ liệu không hợp lệ');
  const message: unknown = body.choices[0]?.message;
  if (!message || typeof message !== 'object' || !('role' in message) || message.role !== 'assistant') throw new Error('AI trả dữ liệu không hợp lệ');
  const record = message as Record<string, unknown>;
  if (record.content != null && typeof record.content !== 'string') throw new Error('Nội dung AI không hợp lệ');
  const calls: ToolCall[] = [];
  if (record.tool_calls !== undefined) {
    if (!Array.isArray(record.tool_calls)) throw new Error('Tool AI không hợp lệ');
    for (const entry of record.tool_calls) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.type !== 'function' || typeof entry.function?.name !== 'string' || typeof entry.function?.arguments !== 'string') throw new Error('Tool AI không hợp lệ');
      calls.push({ id: entry.id, type: 'function', function: { name: entry.function.name, arguments: entry.function.arguments } });
    }
  }
  return { role: 'assistant', content: typeof record.content === 'string' ? record.content : null, tool_calls: calls };
}
