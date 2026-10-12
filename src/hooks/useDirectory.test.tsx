import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { useDirectory } from './useDirectory';
const mock = vi.hoisted(() => ({ auth: { user: { id: 'admin' }, role: 'admin' }, rpc: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/authState', () => ({ useAuth: () => mock.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
vi.mock('@/lib/notifications', () => ({ toast: { error: mock.error } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mock.auth = { user: { id: 'admin' }, role: 'admin' }; });
it('ignores an old privileged directory response after switching accounts', async () => {
  let resolveOld: (value: unknown) => void = () => undefined;
  mock.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ data: [{ id: 'staff', full_name: 'An', username: 'an', role: 'staff', hide_personal: true, phone: null }], error: null });
  const { result, rerender } = renderHook(useDirectory);
  mock.auth = { user: { id: 'staff' }, role: 'staff' }; rerender();
  await waitFor(() => expect(result.current.rows[0]?.id).toBe('staff'));
  await act(async () => resolveOld({ data: [{ id: 'private', full_name: 'Private', username: 'private', phone: 'secret' }], error: null }));
  expect(result.current.rows.map(row => row.id)).toEqual(['staff']);
  expect(result.current.canSeeSensitive(result.current.rows[0])).toBe(false);
  act(() => result.current.setQuery('missing'));
  expect(result.current.filtered).toEqual([]);
});
it('reports rejected requests without presenting stale directory data', async () => {
  mock.rpc.mockRejectedValueOnce(new Error('network failed'));
  const { result } = renderHook(useDirectory);
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith('network failed'));
  expect(result.current.rows).toEqual([]);
});
