import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
test('area deletion protects active tables and preserves inactive table history', async () => {
 const db = new PGlite()
 try {
  await db.exec(`CREATE SCHEMA restaurant_private;
   CREATE TABLE areas(id integer PRIMARY KEY);
   CREATE TABLE restaurant_tables(id integer PRIMARY KEY,area_id integer REFERENCES areas(id) ON DELETE SET NULL,status text,merged_group_id integer,sort_order integer);
   CREATE TABLE orders(id integer PRIMARY KEY,table_id integer REFERENCES restaurant_tables(id),is_paid boolean,total numeric);
   CREATE TABLE table_groups(id integer PRIMARY KEY,primary_table_id integer REFERENCES restaurant_tables(id));`)
  await db.exec(await readFile(new URL('../migrations/20261010010000_allow_inactive_area_deletion.sql',import.meta.url),'utf8'))
  await db.exec(`CREATE TRIGGER area_guard BEFORE DELETE ON areas FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_layout();
   CREATE TRIGGER layout_guard BEFORE UPDATE ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_layout();
   INSERT INTO areas SELECT generate_series(1,7);
   INSERT INTO restaurant_tables VALUES (1,1,'empty',null,1),(2,2,'serving',null,1),(3,3,'awaiting_payment',null,1),
    (4,4,'needs_cleanup',null,1),(5,5,'empty',8,1),(6,6,'empty',null,1),(7,7,'empty',null,1);
   INSERT INTO orders VALUES (1,1,true,123456),(2,6,false,15000);
   INSERT INTO table_groups VALUES (8,7);`)
  for (const id of [2,3,4,5,6,7]) await assert.rejects(db.query('DELETE FROM areas WHERE id=$1',[id]),/Không thể xóa|không thể xóa/)
  await db.exec('DELETE FROM areas WHERE id=1')
  assert.equal((await db.query('SELECT area_id FROM restaurant_tables WHERE id=1')).rows[0].area_id,null)
  assert.deepEqual((await db.query('SELECT total::text,is_paid FROM orders WHERE id=1')).rows,[{total:'123456',is_paid:true}])
  assert.equal((await db.query('SELECT count(*)::integer n FROM restaurant_tables')).rows[0].n,7)
 } finally {await db.close()}
})
