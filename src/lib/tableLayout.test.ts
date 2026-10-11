import { describe,expect,it } from 'vitest';
import { tableGroupLayout } from './tableLayout';

describe('merged table responsive layout', () => {
  it.each([1, 2, 3, 4, 6, 7, 12, 24])('caps group %i to the parent columns at every breakpoint', size => {
    const layout = tableGroupLayout(size);
    expect(layout.span).toBe(`col-span-${Math.min(size, 3)} sm:col-span-${Math.min(size, 4)} md:col-span-${Math.min(size, 6)}`);
    expect(layout.grid).toBe(`grid-cols-${Math.min(size, 3)} sm:grid-cols-${Math.min(size, 4)} md:grid-cols-${Math.min(size, 6)}`);
  });
  it('keeps groups larger than a row in the same container, with wrapping columns', () => {
    expect(tableGroupLayout(12)).toEqual(tableGroupLayout(6));
    expect(tableGroupLayout(0).span).toContain('col-span-1');
  });
});
