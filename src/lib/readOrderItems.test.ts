import { afterEach, expect, it, vi } from 'vitest';
import { readOrderItems } from './readOrderItems';
const mock = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => { const q = { select: () => q, in: () => q, order: () => q, range: mock.range }; return q; } } }));
afterEach(() => vi.clearAllMocks());
it('reads more than a thousand items and preserves their order association', async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), order_id: 'legacy' }));
  mock.range.mockImplementation(async (offset, last) => ({ data: rows.slice(offset, last + 1), error: null }));
  const result = await readOrderItems(['legacy']);
  expect(result.get('legacy')).toHaveLength(1001);
  expect(mock.range).toHaveBeenCalledTimes(2);
});
it('fails the entire read when a later page fails', async () => {
  mock.range.mockResolvedValueOnce({ data: Array(1000).fill({ order_id: 'legacy' }), error: null }).mockResolvedValueOnce({ data: null, error: new Error('page failed') });
  await expect(readOrderItems(['legacy'])).rejects.toThrow('page failed');
});
