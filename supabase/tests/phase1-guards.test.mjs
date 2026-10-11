// Entirely in-memory PostgreSQL. Never reads .env or connects to Supabase.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const migration = await readFile(new URL('../migrations/20261009010000_phase1_password_and_table_history.sql', import.meta.url), 'utf8')
const user = '00000000-0000-0000-0000-000000000001'
const historyTable = '00000000-0000-0000-0000-000000000002'
const invoice = '00000000-0000-0000-0000-000000000003'

for (const deleteRule of ['CASCADE', 'RESTRICT']) {
  test(`phase 1 guards against the ${deleteRule} schema`, async t => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text);
        CREATE TYPE public.table_status AS ENUM ('empty','serving','awaiting_payment','needs_cleanup');
        CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), visible_password text, full_name text);
        CREATE TABLE public.restaurant_tables (id uuid PRIMARY KEY, status public.table_status NOT NULL DEFAULT 'empty', merged_group_id uuid);
        CREATE TABLE public.orders (id uuid PRIMARY KEY, table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE ${deleteRule}, is_paid boolean NOT NULL DEFAULT false, total numeric);
        INSERT INTO auth.users VALUES ('${user}', 'unchanged-auth-hash');
        INSERT INTO public.profiles VALUES ('${user}', 'synthetic-old-copy', 'Test user');
        INSERT INTO public.restaurant_tables (id) VALUES ('${historyTable}');
        INSERT INTO public.orders VALUES ('${invoice}', '${historyTable}', true, 123456);
      `)
      await db.exec(migration)

      await t.test('clears duplicate plaintext, preserving the Auth credential and profile', async () => {
        const { rows } = await db.query(`SELECT p.full_name,p.visible_password,u.encrypted_password FROM public.profiles p JOIN auth.users u ON p.id=u.id`)
        assert.deepEqual(rows, [{ full_name: 'Test user', visible_password: null, encrypted_password: 'unchanged-auth-hash' }])
      })

      await t.test('old clients cannot write a new readable password copy', async () => {
        await db.query('UPDATE public.profiles SET visible_password=$1 WHERE id=$2', ['synthetic-new-copy', user])
        const { rows } = await db.query('SELECT visible_password FROM public.profiles')
        assert.equal(rows[0].visible_password, null)
      })

      await t.test('keeps an empty table with paid history and its original invoice amount', async () => {
        await assert.rejects(db.query('DELETE FROM public.restaurant_tables WHERE id=$1', [historyTable]), /lịch sử/)
        const { rows } = await db.query('SELECT id,total,is_paid FROM public.orders')
        assert.deepEqual(rows, [{ id: invoice, total: '123456', is_paid: true }])
      })

      await t.test('retains or upgrades the foreign key to RESTRICT without dropping history', async () => {
        const { rows } = await db.query(`SELECT confdeltype FROM pg_constraint WHERE conrelid='public.orders'::regclass AND contype='f'`)
        assert.equal(rows[0].confdeltype, 'r')
      })

      await t.test('blocks active or grouped tables that have no orders', async () => {
        for (const [index, status, group] of [[4, 'serving', null], [5, 'awaiting_payment', null], [6, 'needs_cleanup', null], [7, 'empty', user]]) {
          const id = `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`
          await db.query('INSERT INTO public.restaurant_tables VALUES ($1,$2,$3)', [id, status, group])
          await assert.rejects(db.query('DELETE FROM public.restaurant_tables WHERE id=$1', [id]), /đang hoạt động/)
        }
      })

      await t.test('allows removing an unused empty independent table', async () => {
        const id = '00000000-0000-0000-0000-000000000008'
        await db.query('INSERT INTO public.restaurant_tables(id) VALUES ($1)', [id])
        await db.query('DELETE FROM public.restaurant_tables WHERE id=$1', [id])
        const { rows } = await db.query('SELECT id FROM public.restaurant_tables WHERE id=$1', [id])
        assert.equal(rows.length, 0)
      })

      await t.test('the migration can be re-applied without changing invoices or accounts', async () => {
        await db.exec(migration)
        const { rows } = await db.query('SELECT total FROM public.orders WHERE id=$1', [invoice])
        assert.equal(rows[0].total, '123456')
        assert.equal((await db.query('SELECT id FROM auth.users')).rows.length, 1)
      })
    } finally {
      await db.close()
    }
  })
}
