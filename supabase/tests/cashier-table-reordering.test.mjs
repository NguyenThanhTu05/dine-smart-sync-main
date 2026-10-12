// Local-only synthetic PostgreSQL. Never reads application credentials or .env.
import EmbeddedPostgres from 'embedded-postgres'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const read = name => readFile(new URL(name, import.meta.url), 'utf8')
const change = await read('../migrations/20261012000000_allow_cashier_table_reordering.sql')
test('cashier table layout permission: isolated real PostgreSQL sessions', { timeout: 120000 }, async t => {
 const directory = await mkdtemp(join(tmpdir(), 'dine-cashier-layout-'))
 const probe = createServer()
 await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
 const port = probe.address().port
 await new Promise(resolve => probe.close(resolve))
 const server = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: randomUUID(),
  port, persistent: true, initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
 const clients = []; let started = false
 try {
  await server.initialise(); await server.start(); started = true
  const owner = server.getPgClient('postgres', '127.0.0.1'); await owner.connect(); clients.push(owner)
  await owner.query(await read('./fixtures/restaurant-cloud-shape.sql'))
  for (const file of ['20261009000000_guard_active_table_deletion.sql', '20261009010000_phase1_password_and_table_history.sql',
   '20261009020000_phase1_atomic_restaurant.sql', '20261009030000_phase2_inventory_and_layout.sql',
   '20261009040000_phase2_input_validation.sql', '20261009050000_phase3_attendance_and_accounts.sql',
   '20261010000000_complete_table_deletion_guard.sql', '20261010010000_allow_inactive_area_deletion.sql']) {
   await owner.query(await read('../migrations/' + file))
  }
  const actors = {}
  for (const role of ['admin', 'cashier', 'staff', 'kitchen', 'anon']) {
   const client = server.getPgClient('postgres', '127.0.0.1'); await client.connect(); clients.push(client)
   if (role !== 'anon') {
    const id = randomUUID()
    await owner.query('INSERT INTO auth.users VALUES($1,$2)', [id, 'synthetic-only'])
    await owner.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [id, role])
    await client.query('SET ROLE authenticated')
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
   } else await client.query('SET ROLE anon')
   actors[role] = client
  }
  const a = randomUUID(), b = randomUUID()
  await owner.query("INSERT INTO areas(id,name) VALUES($1,'Area A'),($2,'Area B')", [a,b])
  const table = async (name, sort = 1, area = a) => {
   const id = randomUUID()
   await owner.query('INSERT INTO restaurant_tables(id,name,area_id,sort_order) VALUES($1,$2,$3,$4)', [id,name,area,sort])
   return id
  }
  const first = await table('First', 1), second = await table('Second', 2)
  const move = (actor, source, target = null, area = null) => actor.query('SELECT restaurant_move_table($1,$2,$3)', [source,target,area])
  const snapshot = async () => (await owner.query('SELECT id,area_id,sort_order,status,merged_group_id FROM restaurant_tables ORDER BY id')).rows
  const before = (await owner.query("SELECT oid,proowner,proacl,proconfig,prosecdef,prosrc FROM pg_proc WHERE oid='restaurant_move_table(uuid,uuid,uuid)'::regprocedure")).rows[0]

  await t.test('old RPC denies cashier; migration is idempotent and changes only the role check', async () => {
   await assert.rejects(move(actors.cashier,first,second), /quyền/)
   await owner.query(change); await owner.query(change)
   const after = (await owner.query("SELECT oid,proowner,proacl,proconfig,prosecdef,prosrc FROM pg_proc WHERE oid='restaurant_move_table(uuid,uuid,uuid)'::regprocedure")).rows[0]
   assert.equal(after.prosrc, before.prosrc.replace("require_role(ARRAY['admin'])", "require_role(ARRAY['admin','cashier'])"))
   assert.deepEqual({ ...after,prosrc: null }, { ...before,prosrc: null })
  })
  await t.test('cashier swaps empty tables and moves across areas; admin remains allowed', async () => {
   await move(actors.cashier,first,second)
   assert.equal((await owner.query('SELECT sort_order FROM restaurant_tables WHERE id=$1',[first])).rows[0].sort_order,2)
   await move(actors.cashier,first,null,b)
   assert.equal((await owner.query('SELECT area_id FROM restaurant_tables WHERE id=$1',[first])).rows[0].area_id,b)
   await move(actors.admin,first,null,a)
  })
  await t.test('staff, kitchen, anon and missing identity cannot use the RPC; cashier cannot manage areas', async () => {
   const before = await snapshot()
   for (const role of ['staff','kitchen','anon']) await assert.rejects(move(actors[role],first,second), /quyền|permission denied/)
   await actors.staff.query("SELECT set_config('request.jwt.claim.sub','',false)")
   await assert.rejects(move(actors.staff,first,second), /quyền|đăng nhập/)
   const result = await actors.cashier.query("UPDATE areas SET name='Forbidden' WHERE id=$1 RETURNING id", [a])
   assert.equal(result.rowCount,0)
   assert.deepEqual(await snapshot(),before)
  })
  await t.test('active, cleanup, unpaid-order and merged source/destination protections remain', async () => {
   for (const status of ['serving','awaiting_payment','needs_cleanup']) {
    const locked = await table('Locked')
    await owner.query('UPDATE restaurant_tables SET status=$1 WHERE id=$2',[status,locked])
    await assert.rejects(move(actors.cashier,locked,second), /đang hoạt động/)
    await assert.rejects(move(actors.cashier,second,locked), /đang hoạt động/)
   }
   const open = await table('Open')
   await owner.query('INSERT INTO orders(table_id) VALUES($1)',[open])
   await assert.rejects(move(actors.cashier,open,second), /đang hoạt động/)
   await assert.rejects(move(actors.cashier,second,open), /đang hoạt động/)
   const grouped = await table('Grouped'), peer = await table('Peer')
   await actors.admin.query('SELECT restaurant_merge($1,$2)',[grouped,peer])
   await assert.rejects(move(actors.cashier,grouped,second), /ghép nhóm/)
   await assert.rejects(move(actors.cashier,second,grouped), /ghép nhóm/)
  })
  await t.test('mid-swap failure rolls back both table positions', async () => {
   const before = await snapshot()
   await owner.query(`CREATE FUNCTION layout_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id='${second}'::uuid THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER layout_test_fail BEFORE UPDATE ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION layout_test_fail()`)
   await assert.rejects(move(actors.cashier,first,second), /injected failure/)
   assert.deepEqual(await snapshot(),before)
   await owner.query('DROP TRIGGER layout_test_fail ON restaurant_tables; DROP FUNCTION layout_test_fail()')
  })
  await t.test('concurrent cashier/admin swaps serialize without losing positions', async () => {
   const x = await table('Concurrent X',100), y = await table('Concurrent Y',101)
   await Promise.all([move(actors.cashier,x,y),move(actors.admin,x,y)])
   assert.deepEqual((await owner.query('SELECT sort_order FROM restaurant_tables WHERE id IN($1,$2) ORDER BY sort_order',[x,y])).rows,[{sort_order:100},{sort_order:101}])
   assert.equal((await owner.query('SELECT sort_order FROM restaurant_tables WHERE id=$1',[x])).rows[0].sort_order,100)
  })
  await t.test('unexpected function source aborts migration without overwriting it', async () => {
   const current = (await owner.query("SELECT pg_get_functiondef('restaurant_move_table(uuid,uuid,uuid)'::regprocedure) AS d")).rows[0].d
   await owner.query(current.replace("require_role(ARRAY['admin','cashier'])", "require_role(ARRAY['admin','cashier','staff'])"))
   await assert.rejects(owner.query(change), /differs from the reviewed/)
   await owner.query('ROLLBACK')
   assert.match((await owner.query("SELECT prosrc FROM pg_proc WHERE oid='restaurant_move_table(uuid,uuid,uuid)'::regprocedure")).rows[0].prosrc, /'staff'/)
   await owner.query(current)
  })
 } finally {
  await Promise.allSettled(clients.map(client => client.end()))
  if (started) await server.stop()
  // Synthetic local files retained for diagnosis. No production data involved.
 }
})
