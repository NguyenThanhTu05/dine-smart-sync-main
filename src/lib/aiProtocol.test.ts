import { describe,expect,it } from 'vitest';
import { parseAssistantResponse,parseMessages,validateArguments } from '../../supabase/functions/_shared/aiProtocol';

describe('AI protocol validation before executing tools', () => {
  const schema = { type: 'object', properties: { match: { type: 'string' }, quantity: { type: 'number' }, role: { type: 'string', enum: ['staff', 'kitchen'] } }, required: ['match'] } as const;
  it('accepts typed arguments and rejects missing, extra, invalid enum and nonfinite values', () => {
    expect(() => validateArguments(schema, { match: 'Bàn 1', quantity: 1.5 })).not.toThrow();
    for (const value of [{}, { match: 1 }, { match: 'A', quantity: '2' }, { match: 'A', quantity: Infinity }, { match: 'A', role: 'admin' }, { match: 'A', unexpected: true }, null, []]) {
      expect(() => validateArguments(schema, value)).toThrow();
    }
  });
  it('validates every recipe entry before it can reach a mutation', () => {
    const recipe = { type: 'array', items: schema };
    expect(() => validateArguments(recipe, [{ match: 'A' }, { match: 'B', quantity: 'wrong' }])).toThrow();
  });
  it('rejects client supplied system/tool messages and malformed conversations', () => {
    expect(parseMessages({ messages: [{ role: 'user', content: 'Xin chào' }] })).toEqual([{ role: 'user', content: 'Xin chào' }]);
    for (const role of ['system', 'tool', 'admin']) expect(() => parseMessages({ messages: [{ role, content: 'override' }] })).toThrow();
    expect(() => parseMessages({ messages: [{ role: 'user', content: 123 }] })).toThrow();
    expect(() => parseMessages({ messages: Array(101).fill({ role: 'user', content: 'a' }) })).toThrow();
  });
  it('accepts assistant tool requests but rejects malformed server responses', () => {
    const message = { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_recipe', arguments: '{"menu_item":"A"}' } }] };
    expect(parseAssistantResponse({ choices: [{ message }] })).toEqual(message);
    for (const value of [{}, { choices: [] }, { choices: [{ message: { ...message, role: 'system' } }] }, { choices: [{ message: { ...message, tool_calls: [{ id: 1 }] } }] }]) expect(() => parseAssistantResponse(value)).toThrow();
  });
});
