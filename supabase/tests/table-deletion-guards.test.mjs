import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const read = name => readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')
test('table deletion guard preserves active, grouped and historical records', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE TABLE restaurant_tables(id integer PRIMARY KEY, status text, merged_group_id integer);
      CREATE TABLE orders(id integer PRIMARY KEY, table_id integer REFERENCES restaurant_tables(id), total numeric);
      CREATE TABLE table_groups(id integer PRIMARY KEY, primary_table_id integer REFERENCES restaurant_tables(id) ON DELETE SET NULL);`)
    await db.exec(await read('20261009000000_guard_active_table_deletion.sql'))
    const migration = await read('20261010000000_complete_table_deletion_guard.sql')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec(`INSERT INTO restaurant_tables VALUES (1,'empty',null),(2,'serving',null),
      (3,'awaiting_payment',null),(4,'needs_cleanup',null),(5,'empty',8),(6,'empty',null),(7,'empty',null);
      INSERT INTO table_groups VALUES (8,6);
      INSERT INTO orders VALUES (1,7,123456);`)
    for (const id of [2,3,4,5,6,7]) {
      await assert.rejects(db.query('DELETE FROM restaurant_tables WHERE id=$1',[id]), /Không thể xóa/)
    }
    await db.exec("BEGIN; UPDATE restaurant_tables SET status='serving' WHERE id=1;")
    await assert.rejects(db.exec('DELETE FROM restaurant_tables WHERE id=1'), /Không thể xóa/)
    await db.exec('ROLLBACK')
    assert.equal((await db.query('SELECT status FROM restaurant_tables WHERE id=1')).rows[0].status,'empty')
    await db.exec('DELETE FROM restaurant_tables WHERE id=1')
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM restaurant_tables')).rows[0].n,6)
    assert.equal((await db.query('SELECT total::text FROM orders')).rows[0].total,'123456')
    assert.equal((await db.query('SELECT primary_table_id FROM table_groups')).rows[0].primary_table_id,6)
  } finally { await db.close() }
})
