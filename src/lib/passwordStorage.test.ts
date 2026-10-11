import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe,expect,it } from 'vitest'

describe('password copies cannot be reintroduced', () => {
  it.each([
    'supabase/functions/admin-users/index.ts',
    'supabase/functions/ai-assistant/index.ts',
    'src/pages/Login.tsx',
    'src/pages/admin/StaffManagement.tsx',
    'src/pages/shared/MePage.tsx',
  ])('%s never writes a visible_password property', file => {
    const source = ts.createSourceFile(file, readFileSync(resolve(file), 'utf8'), ts.ScriptTarget.Latest, true)
    const copies: number[] = []
    function visit(node: ts.Node) {
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
          node.name.getText(source).replace(/['"]/g, '') === 'visible_password') {
        copies.push(source.getLineAndCharacterOfPosition(node.pos).line + 1)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(copies).toEqual([])
  })
})
