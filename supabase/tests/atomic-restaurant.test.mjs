// Local-only PostgreSQL integration suite. Does not read .env or contact Supabase.
import EmbeddedPostgres from 'embedded-postgres'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const preflight = await readFile(new URL('./preflight.sql', import.meta.url), 'utf8')
const fixture = await readFile(new URL('./fixtures/restaurant-cloud-shape.sql', import.meta.url), 'utf8')
const initialGuard = await readFile(new URL('../migrations/20261009000000_guard_active_table_deletion.sql', import.meta.url), 'utf8')
const guards = await readFile(new URL('../migrations/20261009010000_phase1_password_and_table_history.sql', import.meta.url), 'utf8')
const atomic = await readFile(new URL('../migrations/20261009020000_phase1_atomic_restaurant.sql', import.meta.url), 'utf8')
const phase2 = await readFile(new URL('../migrations/20261009030000_phase2_inventory_and_layout.sql', import.meta.url), 'utf8')
const validation = await readFile(new URL('../migrations/20261009040000_phase2_input_validation.sql', import.meta.url), 'utf8')
const phase3 = await readFile(new URL('../migrations/20261009050000_phase3_attendance_and_accounts.sql', import.meta.url), 'utf8')
const phase2Preflight = await readFile(new URL('./preflight-phase2.sql', import.meta.url), 'utf8')

test('isolated PostgreSQL: permissions, financial transactions and real concurrent sessions', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dine-smart-phase1-'))
  const probe = createServer()
  await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const testPassword = randomUUID()
  const server = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: testPassword,
    port, persistent: true, initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: error => console.error(error) })
  const clients = []
  let started = false
  try {
    await server.initialise(); await server.start(); started = true
    const owner = server.getPgClient('postgres','127.0.0.1'); await owner.connect(); clients.push(owner)
    await owner.query(fixture)
    const users = Object.fromEntries(['admin','cashier','staff','kitchen','otherStaff'].map(role => [role,randomUUID()]))
    for (const [role,id] of Object.entries(users)) {
      await owner.query('INSERT INTO auth.users VALUES($1,$2)', [id,'synthetic-hash'])
      await owner.query('INSERT INTO public.profiles(id,username,full_name,visible_password,phone) VALUES($1,$2,$2,$3,$4)', [id,role,'synthetic-copy','private-phone'])
      await owner.query('INSERT INTO public.user_roles(user_id,role) VALUES($1,$2)', [id,role==='otherStaff'?'staff':role])
    }
    const oldTable=randomUUID(), oldOrder=randomUUID(), menu=randomUUID(), ingredient=randomUUID(), ready=randomUUID()
    await owner.query('INSERT INTO public.restaurant_tables(id,name) VALUES($1,$2)',[oldTable,'Legacy'])
    await owner.query('INSERT INTO public.orders(id,table_id,is_paid,total,paid_at) VALUES($1,$2,true,123456,now())',[oldOrder,oldTable])
    await owner.query('INSERT INTO public.menu_items(id,name,price,no_cook) VALUES($1,$2,10000,false),($3,$4,5000,true)',[menu,'Cooked test',ready,'Ready test'])
    await owner.query('INSERT INTO public.ingredients(id,name,stock) VALUES($1,$2,1000)',[ingredient,'Ingredient test'])
    await owner.query('INSERT INTO public.recipes(menu_item_id,ingredient_id,quantity) VALUES($1,$2,2),($3,$2,1)',[menu,ingredient,ready])
    await owner.query('UPDATE public.payment_settings SET service_percent=10,vat_percent=8,global_discount_percent=5')
    await owner.query('BEGIN READ ONLY')
    try { await owner.query(preflight) } finally { await owner.query('ROLLBACK') }
    await owner.query(initialGuard); await owner.query(guards); await owner.query(atomic)
    const actor = async role => {
      const c=server.getPgClient('postgres','127.0.0.1'); await c.connect(); clients.push(c)
      await c.query('SET ROLE authenticated'); await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users[role]])
      return c
    }
    const staff=await actor('staff'), staff2=await actor('otherStaff'), cashier=await actor('cashier'), kitchen=await actor('kitchen'), admin=await actor('admin')
    const makeTable = async name => {
      const id=randomUUID(); await owner.query('INSERT INTO public.restaurant_tables(id,name) VALUES($1,$2)',[id,name]); return id
    }
    const submit = async (c,table,lines=[{menu_item_id:menu,quantity:1}],request=randomUUID()) =>
      (await c.query('SELECT public.restaurant_submit_order($1,$2::jsonb,$3,$4) id',[table,JSON.stringify(lines),'',request])).rows[0].id
    const quote = async (c,id) => (await c.query('SELECT public.restaurant_quote($1) q',[id])).rows[0].q
    const payment = async (c,id,action,fingerprint) => (await c.query('SELECT public.restaurant_payment($1,$2,$3) q',[id,action,fingerprint])).rows[0].q
    let table, order

    await t.test('legacy amounts and Auth hashes are untouched; directory hides personal data', async () => {
      assert.deepEqual((await owner.query('SELECT total,payment_snapshot FROM public.orders WHERE id=$1',[oldOrder])).rows,[{total:'123456',payment_snapshot:null}])
      assert.equal((await owner.query('SELECT encrypted_password FROM auth.users LIMIT 1')).rows[0].encrypted_password,'synthetic-hash')
      assert.equal((await staff.query('SELECT * FROM public.restaurant_directory() WHERE id=$1',[users.kitchen])).rows[0].phone,null)
      assert.equal((await staff.query('SELECT * FROM public.profiles WHERE id=$1',[users.kitchen])).rows.length,0)
      assert.equal((await admin.query('SELECT * FROM public.restaurant_directory() WHERE id=$1',[users.kitchen])).rows[0].phone,'private-phone')
    })
    await t.test('RLS blocks anonymous read, role escalation and direct financial writes, including Admin', async () => {
      const anon=server.getPgClient('postgres','127.0.0.1'); await anon.connect(); clients.push(anon); await anon.query('SET ROLE anon')
      await assert.rejects(anon.query('SELECT * FROM public.orders'),/permission denied/)
      await assert.rejects(staff.query('UPDATE public.user_roles SET role=\'admin\''),/permission denied/)
      for (const c of [staff,cashier,kitchen,admin]) {
        await assert.rejects(c.query('UPDATE public.orders SET is_paid=true'),/permission denied/)
        await assert.rejects(c.query('DELETE FROM public.order_items'),/permission denied/)
      }
      assert.equal((await staff.query('UPDATE public.ingredients SET stock=0 RETURNING id')).rows.length,0)
      await assert.rejects(staff.query("SELECT restaurant_private.table_ids($1)",[oldTable]),/permission denied/)
    })
    await t.test('two users order one table concurrently: one open invoice, both carts, server price and correct stock', async () => {
      table=await makeTable('Concurrent order')
      const before=Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock)
      const ids=await Promise.all([submit(staff,table,[{menu_item_id:menu,quantity:2,price_snapshot:1}]),submit(staff2,table,[{menu_item_id:ready,quantity:1}])])
      assert.equal(ids[0],ids[1]); order=ids[0]
      assert.equal((await owner.query('SELECT count(*) FROM public.orders WHERE table_id=$1 AND NOT is_paid',[table])).rows[0].count,'1')
      assert.equal((await owner.query('SELECT count(*) FROM public.order_items WHERE order_id=$1',[order])).rows[0].count,'3')
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before-5)
      assert.equal((await quote(staff,order)).subtotal,25000)
    })
    await t.test('order retries use an idempotency key and cannot reuse it with different content', async () => {
      const id=randomUUID(), lines=[{menu_item_id:menu,quantity:1}]
      const retrySession=await actor('staff')
      const ids=await Promise.all([submit(staff,table,lines,id),submit(retrySession,table,lines,id)])
      assert.equal(ids[0],ids[1])
      assert.equal((await owner.query('SELECT count(*) FROM public.order_items WHERE order_id=$1',[order])).rows[0].count,'4')
      await assert.rejects(submit(staff,table,[{menu_item_id:menu,quantity:2}],id),/nội dung khác/)
    })
    await t.test('failed second order line rolls back invoice, first line, table status, stock and retry key', async () => {
      const id=await makeTable('Failure'), before=(await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock
      await assert.rejects(submit(staff,id,[{menu_item_id:menu,quantity:1},{menu_item_id:randomUUID(),quantity:1}]),/không còn bán/)
      assert.equal((await owner.query('SELECT count(*) FROM public.orders WHERE table_id=$1',[id])).rows[0].count,'0')
      assert.equal((await owner.query('SELECT status FROM public.restaurant_tables WHERE id=$1',[id])).rows[0].status,'empty')
      assert.equal((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock,before)
    })
    await t.test('preserves kitchen/staff permissions and rejects a stale cancellation after cooking starts', async () => {
      const item=(await owner.query("SELECT id FROM public.order_items WHERE order_id=$1 AND NOT no_cook LIMIT 1",[order])).rows[0].id
      await assert.rejects(staff.query("SELECT public.restaurant_item($1,'start')",[item]),/Không có quyền/)
      await assert.rejects(kitchen.query("SELECT public.restaurant_item($1,'serve')",[item]),/Không có quyền/)
      await kitchen.query("SELECT public.restaurant_item($1,'start')",[item])
      await assert.rejects(staff.query("SELECT public.restaurant_item($1,'cancel')",[item]),/Trạng thái món/)
      await kitchen.query("SELECT public.restaurant_item($1,'finish')",[item]); await staff.query("SELECT public.restaurant_item($1,'serve')",[item])
      assert.equal((await owner.query('SELECT status,done_at,served_at FROM public.order_items WHERE id=$1',[item])).rows[0].status,'served')
    })
    await t.test('returns are atomic: invalid second item restores the first item and stock', async () => {
      const item=(await owner.query('SELECT id,quantity FROM public.order_items WHERE order_id=$1 AND no_cook LIMIT 1',[order])).rows[0]
      const before=(await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock
      await assert.rejects(staff.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'test')",[order,JSON.stringify([{id:item.id,quantity:1,expected_quantity:item.quantity},{id:randomUUID(),quantity:1,expected_quantity:1}])]),/không thuộc/)
      assert.equal((await owner.query('SELECT count(*) FROM public.order_items WHERE id=$1',[item.id])).rows[0].count,'1')
      assert.equal((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock,before)
      await staff.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'test')",[order,JSON.stringify([{id:item.id,quantity:1,expected_quantity:item.quantity}])])
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),Number(before)+1)
    })
    await t.test('rounds server fees in the existing order and applies per-order discount before global fallback', async () => {
      const q=await quote(staff,order)
      assert.equal(q.subtotal,30000); assert.equal(q.service_fee,3000); assert.equal(q.vat_fee,2640); assert.equal(q.discount_amount,1782); assert.equal(q.total,33858)
      await staff.query("SELECT public.restaurant_adjust($1,'discount',$2::jsonb,'test')",[order,'{"percent":10}'])
      const discounted=await quote(staff,order); assert.equal(discounted.total,32076)
      await assert.rejects(payment(staff,order,'confirm_cash',q.fingerprint),/vừa thay đổi/)
    })
    await t.test('stale bill after a concurrent added item or fee change cannot be paid', async () => {
      const q=await quote(staff,order)
      await submit(staff2,table)
      await assert.rejects(payment(staff,order,'confirm_cash',q.fingerprint),/vừa thay đổi/)
      const q2=await quote(staff,order)
      await owner.query('UPDATE public.payment_settings SET vat_percent=9')
      await assert.rejects(payment(staff,order,'confirm_cash',q2.fingerprint),/vừa thay đổi/)
    })
    await t.test('failure changing table status rolls back the paid flag, snapshot, notes and paid_at', async () => {
      await owner.query(`CREATE FUNCTION public.test_fail_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='needs_cleanup' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_fail_cleanup BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.test_fail_cleanup()`)
      const q=await quote(staff,order)
      await assert.rejects(payment(staff,order,'confirm_cash',q.fingerprint),/injected failure/)
      const row=(await owner.query('SELECT is_paid,payment_snapshot,paid_at FROM public.orders WHERE id=$1',[order])).rows[0]
      assert.deepEqual(row,{is_paid:false,payment_snapshot:null,paid_at:null})
      await owner.query('DROP TRIGGER test_fail_cleanup ON public.restaurant_tables; DROP FUNCTION public.test_fail_cleanup()')
    })
    let settled
    await t.test('two cash confirmations settle exactly once and preserve staff cash permission', async () => {
      const q=await quote(staff,order)
      const results=await Promise.all([payment(staff,order,'confirm_cash',q.fingerprint),payment(cashier,order,'confirm_cash',q.fingerprint)])
      assert.deepEqual(results[0],results[1]); settled=results[0]
      assert.equal((await owner.query('SELECT status FROM public.restaurant_tables WHERE id=$1',[table])).rows[0].status,'needs_cleanup')
      const notes=(await owner.query('SELECT notes FROM public.orders WHERE id=$1',[order])).rows[0].notes
      assert.equal(notes.split('[Người thu:').length-1,1)
    })
    await t.test('paid snapshots survive config changes; neither items nor paid invoices can be changed even by owner code', async () => {
      await owner.query('UPDATE public.payment_settings SET vat_percent=99,service_percent=99,global_discount_percent=99')
      assert.deepEqual(await quote(cashier,order),settled)
      await assert.rejects(payment(cashier,order,'confirm_qr',settled.fingerprint),/không thể đổi phương thức/)
      await assert.rejects(payment(staff,order,'request_qr',settled.fingerprint),/không thể đổi phương thức/)
      await assert.rejects(owner.query('UPDATE public.orders SET total=0 WHERE id=$1',[order]),/đã thanh toán/)
      await assert.rejects(owner.query('DELETE FROM public.order_items WHERE order_id=$1',[order]),/đã thanh toán/)
      await assert.rejects(owner.query('INSERT INTO public.orders(table_id,is_paid,total) VALUES($1,true,1)',[oldTable]),/Hóa đơn mới/)
      await assert.rejects(payment(cashier,oldOrder,'confirm_cash','anything'),/Hóa đơn cũ/)
      await assert.rejects(owner.query('DELETE FROM public.restaurant_tables WHERE id=$1',[oldTable]),/lịch sử/)
      await staff.query('SELECT public.restaurant_release($1,true)',[table])
      assert.equal((await owner.query('SELECT status FROM public.restaurant_tables WHERE id=$1',[table])).rows[0].status,'empty')
    })
    await t.test('QR request stays unpaid, staff cannot confirm QR, cashier can; no cross-role override', async () => {
      const id=await makeTable('QR'), oid=await submit(staff,id), q=await quote(staff,oid)
      await assert.rejects(payment(kitchen,oid,'confirm_cash',q.fingerprint),/Không có quyền/)
      await payment(staff,oid,'request_qr',q.fingerprint)
      assert.equal((await owner.query('SELECT is_paid FROM public.orders WHERE id=$1',[oid])).rows[0].is_paid,false)
      await assert.rejects(payment(staff,oid,'confirm_qr',q.fingerprint),/Không có quyền/)
      await payment(cashier,oid,'confirm_qr',q.fingerprint)
    })
    await t.test('merge transfers both complete groups atomically without deleting orders or items', async () => {
      const [a,b,c,d]=await (async()=>{ const result=[]; for(const name of ['A','B','C','D']) result.push(await makeTable(name)); return result })()
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b]); await staff.query('SELECT public.restaurant_merge($1,$2)',[c,d])
      const oid=await submit(staff,c)
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,c])
      const groups=(await owner.query('SELECT DISTINCT merged_group_id FROM public.restaurant_tables WHERE id=ANY($1::uuid[])',[[a,b,c,d]])).rows
      assert.equal(groups.length,1)
      assert.equal((await owner.query('SELECT count(*) FROM public.order_items WHERE order_id=$1',[oid])).rows[0].count,'1')
      await assert.rejects(staff.query('SELECT public.restaurant_release($1,false)',[a]),/Không thể/)
    })
    await t.test('merge midway failure leaves both complete groups and invoices unchanged', async () => {
      const [a,b,c,d]=await (async()=>{ const result=[]; for(const name of ['E','F','G','H']) result.push(await makeTable(name)); return result })()
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b]); await staff.query('SELECT public.restaurant_merge($1,$2)',[c,d])
      const before=(await owner.query('SELECT id,merged_group_id,status FROM public.restaurant_tables WHERE id=ANY($1::uuid[]) ORDER BY id',[[a,b,c,d]])).rows
      await owner.query(`CREATE FUNCTION public.test_fail_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected merge failure'; END $$;
        CREATE TRIGGER test_fail_group BEFORE UPDATE ON public.table_groups FOR EACH ROW EXECUTE FUNCTION public.test_fail_group()`)
      await assert.rejects(staff.query('SELECT public.restaurant_merge($1,$2)',[a,c]),/injected merge failure/)
      assert.deepEqual((await owner.query('SELECT id,merged_group_id,status FROM public.restaurant_tables WHERE id=ANY($1::uuid[]) ORDER BY id',[[a,b,c,d]])).rows,before)
      await owner.query('DROP TRIGGER test_fail_group ON public.table_groups; DROP FUNCTION public.test_fail_group()')
    })
    await t.test('concurrent merge versus order includes all members and has only one open invoice', async () => {
      const [a,b]=await (async()=>{ const result=[]; for(const name of ['RaceA','RaceB']) result.push(await makeTable(name)); return result })()
      await Promise.all([staff.query('SELECT public.restaurant_merge($1,$2)',[a,b]),submit(staff2,b)])
      const row=(await owner.query('SELECT count(DISTINCT merged_group_id) groups,count(DISTINCT status) statuses FROM public.restaurant_tables WHERE id=ANY($1::uuid[])',[[a,b]])).rows[0]
      assert.deepEqual(row,{groups:'1',statuses:'1'})
      assert.equal((await owner.query('SELECT count(*) FROM public.orders WHERE table_id=ANY($1::uuid[]) AND NOT is_paid',[[a,b]])).rows[0].count,'1')
    })
    await t.test('a held financial lock blocks another session; lock timeout leaves no partial order', async () => {
      const id=await makeTable('Lock wait')
      await owner.query('BEGIN'); await owner.query('SELECT pg_advisory_xact_lock(20261009,1)')
      await staff.query("SET lock_timeout='50ms'")
      try { await assert.rejects(submit(staff,id),/lock timeout/) }
      finally { await owner.query('ROLLBACK'); await staff.query("SET lock_timeout='0'") }
      assert.equal((await owner.query('SELECT count(*) FROM public.orders WHERE table_id=$1',[id])).rows[0].count,'0')
      await submit(staff,id)
    })
    await t.test('cancellation racing kitchen start permits exactly one transition', async () => {
      const id=await makeTable('Cancel race'), oid=await submit(staff,id)
      const item=(await owner.query('SELECT id FROM public.order_items WHERE order_id=$1',[oid])).rows[0].id
      const results=await Promise.allSettled([staff.query("SELECT public.restaurant_item($1,'cancel')",[item]),kitchen.query("SELECT public.restaurant_item($1,'start')",[item])])
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
      const rows=(await owner.query('SELECT status FROM public.order_items WHERE id=$1',[item])).rows
      assert.ok(rows.length===0 || rows[0].status==='cooking')
    })
    await t.test('checkout racing an extra cart cannot both settle an old amount and add unpaid items', async () => {
      const id=await makeTable('Payment order race'), oid=await submit(staff,id), q=await quote(staff,oid)
      const results=await Promise.allSettled([payment(staff,oid,'confirm_cash',q.fingerprint),submit(staff2,id)])
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
      const o=(await owner.query('SELECT is_paid,payment_snapshot FROM public.orders WHERE id=$1',[oid])).rows[0]
      const count=Number((await owner.query('SELECT count(*) FROM public.order_items WHERE order_id=$1',[oid])).rows[0].count)
      if (o.is_paid) { assert.equal(count,1); assert.equal(o.payment_snapshot.items.length,1) }
      else { assert.equal(count,2); assert.equal(o.payment_snapshot,null) }
    })
    await t.test('AI/admin metadata edits cannot skip payment or update only one member status', async () => {
      const [a,b]=await (async()=>{ const result=[]; for(const name of ['MetadataA','MetadataB']) result.push(await makeTable(name)); return result })()
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b])
      await admin.query("SELECT public.restaurant_edit_table($1,'{\"status\":\"serving\"}'::jsonb)",[a])
      assert.equal((await owner.query("SELECT count(*) FROM public.restaurant_tables WHERE id=ANY($1::uuid[]) AND status='serving'",[[a,b]])).rows[0].count,'2')
      await submit(staff,b)
      await assert.rejects(admin.query("SELECT public.restaurant_edit_table($1,'{\"status\":\"empty\",\"name\":\"wrong\"}'::jsonb)",[a]),/quy trình/)
      assert.equal((await owner.query('SELECT name FROM public.restaurant_tables WHERE id=$1',[a])).rows[0].name,'MetadataA')
      await assert.rejects(cashier.query("SELECT public.restaurant_edit_table($1,'{}'::jsonb)",[a]),/Không có quyền/)
    })
    await t.test('duplicate-data preflight aborts all schema changes and preserves both original orders', async () => {
      await owner.query('CREATE DATABASE phase1_preflight')
      const other=server.getPgClient('phase1_preflight','127.0.0.1'); await other.connect(); clients.push(other)
      await other.query(fixture.replace('CREATE ROLE anon NOLOGIN;','').replace('CREATE ROLE authenticated NOLOGIN;',''))
      const tid=randomUUID()
      await other.query('INSERT INTO public.restaurant_tables(id,name) VALUES($1,$2)',[tid,'Preflight'])
      await other.query('INSERT INTO public.orders(table_id,total) VALUES($1,111),($1,222)',[tid])
      await assert.rejects(other.query(atomic),/duplicate open orders/)
      await other.query('ROLLBACK')
      assert.deepEqual((await other.query('SELECT total FROM public.orders ORDER BY total')).rows,[{total:'111'},{total:'222'}])
      assert.equal((await other.query("SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_snapshot'")).rows[0].count,'0')
      assert.equal((await other.query("SELECT count(*) FROM pg_namespace WHERE nspname='restaurant_private'")).rows[0].count,'0')
    })
    await t.test('migration reapplication is idempotent and still preserves legacy money', async () => {
      await owner.query(atomic)
      assert.equal((await owner.query('SELECT total FROM public.orders WHERE id=$1',[oldOrder])).rows[0].total,'123456')
    })
    await t.test('synthetic backup restores paid snapshots, original legacy data and RLS into a separate database', async () => {
      // The embedded distribution omits pg_dump/pg_restore. Rehearse a
      // synthetic logical backup of the known schema + all fixture rows instead;
      // this does not claim to validate managed Supabase Auth/PITR restoration.
      const names=['auth.users','public.profiles','public.user_roles','public.areas','public.restaurant_tables','public.table_groups',
        'public.categories','public.menu_items','public.ingredients','public.recipes','public.stock_movements','public.orders',
        'public.order_items','public.payment_settings','restaurant_private.submit_requests']
      const data={}
      await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      try {
        for (const name of names) data[name]=(await owner.query(`SELECT * FROM ${name}`)).rows
      } finally { await owner.query('COMMIT') }
      const path=join(directory,'synthetic-logical-backup.json')
      await writeFile(path,JSON.stringify({fixture,guards,atomic,data}),'utf8')
      const backup=JSON.parse(await readFile(path,'utf8'))
      await owner.query('CREATE DATABASE phase1_restored')
      const restored=server.getPgClient('phase1_restored','127.0.0.1'); await restored.connect(); clients.push(restored)
      await restored.query(backup.fixture.replace('CREATE ROLE anon NOLOGIN;','').replace('CREATE ROLE authenticated NOLOGIN;',''))
      await restored.query(backup.guards); await restored.query(backup.atomic)
      await restored.query('BEGIN; SET LOCAL session_replication_role=replica')
      try {
        for (const name of names) await restored.query(`DELETE FROM ${name}`)
        for (const name of names) await restored.query(`INSERT INTO ${name} SELECT * FROM jsonb_populate_recordset(NULL::${name}, $1::jsonb)`,[JSON.stringify(backup.data[name])])
        await restored.query('COMMIT')
      } catch(error) { await restored.query('ROLLBACK'); throw error }
      for (const name of names) assert.equal(Number((await restored.query(`SELECT count(*) FROM ${name}`)).rows[0].count),backup.data[name].length)
      assert.deepEqual((await restored.query('SELECT payment_snapshot FROM public.orders WHERE id=$1',[order])).rows[0].payment_snapshot,settled)
      assert.equal((await restored.query('SELECT total FROM public.orders WHERE id=$1',[oldOrder])).rows[0].total,'123456')
      await restored.query('SET ROLE authenticated'); await restored.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users.staff])
      await assert.rejects(restored.query('UPDATE public.orders SET total=0'),/permission denied/)
      assert.equal((await restored.query('SELECT * FROM public.profiles WHERE id=$1',[users.kitchen])).rows.length,0)
    })
    await t.test('phase2 migration applies without changing the three existing stock triggers', async () => {
      await owner.query(phase2Preflight)
      await owner.query(phase2); await owner.query(validation)
      assert.equal((await owner.query("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND tgname IN ('trg_deduct_stock_insert','trg_restore_stock_update','trg_restore_stock_delete')")).rows[0].count,'3')
    })
    const stock = async(c,action,id,data,key=randomUUID()) => (await c.query('SELECT public.restaurant_stock($1,$2,$3::jsonb,$4) result',[action,id,JSON.stringify(data),key])).rows[0].result
    await t.test('phase2: concurrent imports add both deltas, retry once, and audit the actual actor', async () => {
      const before=Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock)
      const admin2=await actor('admin'), key=randomUUID()
      await Promise.all([stock(admin,'adjust',ingredient,{delta:10},key),stock(admin2,'adjust',ingredient,{delta:20})])
      await stock(admin,'adjust',ingredient,{delta:10},key)
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before+30)
      assert.equal((await owner.query('SELECT count(*) FROM public.stock_movements WHERE ingredient_id=$1 AND created_by=$2',[ingredient,users.admin])).rows[0].count,'2')
      await assert.rejects(stock(admin,'adjust',ingredient,{delta:11},key),/nội dung khác/)
      for(const c of [staff,cashier,kitchen]) await assert.rejects(stock(c,'adjust',ingredient,{delta:1}),/Không có quyền/)
      await assert.rejects(admin.query('UPDATE public.ingredients SET stock=0'),/permission denied/)
    })
    await t.test('phase2: stock movement failure rolls back stock and request key', async () => {
      await owner.query(`CREATE FUNCTION public.test_fail_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected stock failure'; END $$;
      CREATE TRIGGER test_fail_stock BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.test_fail_stock()`)
      const before=(await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock, key=randomUUID()
      await assert.rejects(stock(admin,'adjust',ingredient,{delta:5},key),/injected stock failure/)
      assert.equal((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock,before)
      assert.equal((await owner.query('SELECT count(*) FROM restaurant_private.stock_requests WHERE request_id=$1',[key])).rows[0].count,'0')
      await owner.query('DROP TRIGGER test_fail_stock ON public.stock_movements; DROP FUNCTION public.test_fail_stock()')
      await stock(admin,'adjust',ingredient,{delta:5},key)
    })
    await t.test('phase2: recipe changes do not change restoration for new cooked/no_cook lines', async () => {
      const m=randomUUID(), t1=await makeTable('Snapshot stock')
      await owner.query('INSERT INTO public.menu_items(id,name,price,no_cook) VALUES($1,$2,1,true)',[m,'Snapshot'])
      await admin.query("SELECT public.restaurant_recipe('add',$1,$2::jsonb,'[]'::jsonb)",[m,JSON.stringify([{ingredient_id:ingredient,quantity:3}])])
      const before=Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock)
      const oid=await submit(staff,t1,[{menu_item_id:m,quantity:2}])
      await admin.query("SELECT public.restaurant_recipe('update',$1,$2::jsonb,$3::jsonb)",[m,JSON.stringify([{ingredient_id:ingredient,quantity:9}]),JSON.stringify([{ingredient_id:ingredient,quantity:3}])])
      const items=(await owner.query('SELECT id,quantity FROM public.order_items WHERE order_id=$1',[oid])).rows
      await staff.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'test')",[oid,JSON.stringify(items.map(i=>({id:i.id,quantity:1,expected_quantity:i.quantity})))])
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before)
      assert.equal((await owner.query('SELECT count(*) FROM restaurant_private.item_stock WHERE item_id=ANY($1::uuid[])',[items.map(i=>i.id)])).rows[0].count,'0')
    })
    await t.test('phase2: legacy open recipe edits are blocked; no fictional historical stock snapshot', async () => {
      const legacy=(await owner.query('SELECT oi.id,oi.menu_item_id FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE NOT o.is_paid LIMIT 1')).rows[0]
      await assert.rejects(owner.query('UPDATE public.recipes SET quantity=quantity+1 WHERE menu_item_id=$1',[legacy.menu_item_id]),/đơn cũ/)
      assert.equal((await owner.query('SELECT count(*) FROM restaurant_private.item_stock WHERE item_id=$1',[legacy.id])).rows[0].count,'0')
    })
    await t.test('phase2: invalid input and stale absolute edit are rejected', async () => {
      for(const delta of [-1e20,'',' ','1e3','NaN','abc','1.0001',null,0,'--1']) await assert.rejects(stock(admin,'adjust',ingredient,{delta}))
      const row=(await owner.query('SELECT * FROM public.ingredients WHERE id=$1',[ingredient])).rows[0]
      await stock(admin,'adjust',ingredient,{delta:1})
      await assert.rejects(stock(admin,'edit',ingredient,{name:row.name,unit:row.unit,stock:row.stock,min_stock:row.min_stock,expected_stock:row.stock,expected:row}),/vừa thay đổi/)
    })
    await t.test('phase2: occupied area cannot be removed and grouped/active table cannot move', async () => {
      const area=randomUUID(), other=randomUUID(), a=await makeTable('MoveA'), b=await makeTable('MoveB')
      await owner.query('INSERT INTO public.areas(id,name) VALUES($1,$2),($3,$4)',[area,'A',other,'B'])
      await owner.query('UPDATE public.restaurant_tables SET area_id=$1 WHERE id=ANY($2::uuid[])',[area,[a,b]])
      await assert.rejects(admin.query('DELETE FROM public.areas WHERE id=$1',[area]),/còn bàn/)
      await admin.query('SELECT public.restaurant_move_table($1,NULL,$2)',[a,other])
      await submit(staff,a)
      await assert.rejects(admin.query('SELECT public.restaurant_move_table($1,NULL,$2)',[a,area]),/đang hoạt động/)
      await assert.rejects(cashier.query('SELECT public.restaurant_move_table($1,NULL,$2)',[b,other]),/Không có quyền/)
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b])
      await assert.rejects(admin.query('SELECT public.restaurant_move_table($1,NULL,$2)',[b,other]),/ghép nhóm/)
    })
    await t.test('phase2: server rejects rounded prices, invalid booleans and concurrent catalog overwrites', async () => {
      for(const price of ['-1','1.001','1e3','','NaN',null]) await assert.rejects(admin.query('SELECT public.restaurant_menu(NULL,$1::jsonb)',[JSON.stringify({name:'Invalid',price})]))
      await assert.rejects(admin.query('SELECT public.restaurant_menu(NULL,$1::jsonb)',[JSON.stringify({name:'Invalid',price:1,no_cook:'true'})]),/boolean/)
      const item=(await admin.query('SELECT public.restaurant_menu(NULL,$1::jsonb) item',[JSON.stringify({name:'Catalog concurrency',price:1})])).rows[0].item
      const admin2=await actor('admin')
      const edits=await Promise.allSettled([admin.query('SELECT public.restaurant_menu($1,$2::jsonb,$3::jsonb)',[item.id,'{"price":2}',JSON.stringify(item)]),admin2.query('SELECT public.restaurant_menu($1,$2::jsonb,$3::jsonb)',[item.id,'{"price":3}',JSON.stringify(item)])])
      assert.equal(edits.filter(x=>x.status==='fulfilled').length,1)
      for(const c of [staff,cashier,kitchen]) await assert.rejects(c.query('SELECT public.restaurant_menu(NULL,$1::jsonb)',['{"name":"forbidden","price":1}']),/Không có quyền/)
    })
    await t.test('phase2: replacement validates all ingredients before deletion and stale recipe fails', async () => {
      const m=(await admin.query('SELECT public.restaurant_menu(NULL,$1::jsonb) item',['{"name":"Atomic recipe","price":1}'])).rows[0].item.id
      const rows=[{ingredient_id:ingredient,quantity:1}]
      await admin.query("SELECT public.restaurant_recipe('add',$1,$2::jsonb,'[]')",[m,JSON.stringify(rows)])
      await assert.rejects(admin.query("SELECT public.restaurant_recipe('replace',$1,$2::jsonb,$3::jsonb)",[m,JSON.stringify([{ingredient_id:ingredient,quantity:2},{ingredient_id:randomUUID(),quantity:1}]),JSON.stringify(rows)]),/không còn tồn tại/)
      assert.equal(Number((await owner.query('SELECT quantity FROM public.recipes WHERE menu_item_id=$1',[m])).rows[0].quantity),1)
      await assert.rejects(admin.query("SELECT public.restaurant_recipe('update',$1,$2::jsonb,'[]')",[m,JSON.stringify(rows)]),/vừa thay đổi/)
      await assert.rejects(admin.query("SELECT public.restaurant_recipe('update',$1,$2::jsonb,$3::jsonb)",[m,JSON.stringify([{ingredient_id:ingredient,quantity:'0.0001'}]),JSON.stringify(rows)]),/thập phân/)
    })
    await t.test('phase2: stage1 merge, concurrent ordering, kitchen, payment snapshots and cleanup remain compatible', async () => {
      const a=await makeTable('Regression A'),b=await makeTable('Regression B')
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b])
      const ids=await Promise.all([submit(staff,a),submit(staff2,b,[{menu_item_id:ready,quantity:1}])]); assert.equal(ids[0],ids[1])
      const cooked=(await owner.query('SELECT id FROM public.order_items WHERE order_id=$1 AND NOT no_cook',[ids[0]])).rows[0].id
      await kitchen.query("SELECT public.restaurant_item($1,'start')",[cooked]); await kitchen.query("SELECT public.restaurant_item($1,'finish')",[cooked])
      await staff.query("SELECT public.restaurant_item($1,'serve')",[cooked])
      const q=await quote(staff,ids[0]); await payment(staff,ids[0],'confirm_cash',q.fingerprint)
      await staff.query('SELECT public.restaurant_release($1,true)',[b])
      assert.equal((await owner.query("SELECT count(*) FROM public.restaurant_tables WHERE id=ANY($1::uuid[]) AND merged_group_id IS NULL AND status='empty'",[[a,b]])).rows[0].count,'2')
      await assert.rejects(owner.query('UPDATE public.orders SET total=0 WHERE id=$1',[ids[0]]),/đã thanh toán/)
    })
    await t.test('phase2: deferred group guard rolls back a partial state at COMMIT', async () => {
      const a=await makeTable('Guard A'),b=await makeTable('Guard B')
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b])
      await owner.query('BEGIN'); await owner.query("UPDATE public.restaurant_tables SET status='serving' WHERE id=$1",[a])
      await assert.rejects(owner.query('COMMIT'),/không nhất quán/)
      assert.equal((await owner.query("SELECT count(*) FROM public.restaurant_tables WHERE id=ANY($1::uuid[]) AND status='empty'",[[a,b]])).rows[0].count,'2')
    })
    await t.test('phase2: import concurrent with deduction preserves both operations', async () => {
      const a=await makeTable('Stock/order race'), before=Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock)
      await Promise.all([stock(admin,'adjust',ingredient,{delta:10}),submit(staff,a,[{menu_item_id:ready,quantity:2}])])
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before+8)
    })
    await t.test('phase2: null recipe replacement cannot erase a formula; database checks profile/payment/GPS values', async () => {
      const m=(await owner.query('SELECT menu_item_id FROM public.recipes LIMIT 1')).rows[0].menu_item_id
      await assert.rejects(admin.query("SELECT public.restaurant_recipe('replace',$1,NULL,'[]')",[m]),/không hợp lệ/)
      await assert.rejects(admin.query('UPDATE public.payment_settings SET vat_percent=-1'),/Phần trăm/)
      await assert.rejects(admin.query('UPDATE public.profiles SET phone=$1 WHERE id=$2',['abc',users.admin]),/điện thoại/)
      await assert.rejects(admin.query('UPDATE public.attendance_settings SET latitude=91'),/Vĩ độ/)
      await assert.rejects(admin.query('UPDATE public.attendance_settings SET radius_m=0'),/lớn hơn/)
      await assert.rejects(staff.query('INSERT INTO public.attendance_logs(user_id,kind,latitude) VALUES($1,$2,91)',[users.staff,'in']),/Vĩ độ/)
    })
    await t.test('phase2 migrations can be reapplied without duplicating stock or changing old money', async () => {
      const before=(await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock
      await owner.query(phase2); await owner.query(validation)
      assert.equal((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock,before)
      assert.equal((await owner.query('SELECT total,payment_snapshot FROM public.orders WHERE id=$1',[oldOrder])).rows[0].total,'123456')
    })
    await t.test('phase2: partial no_cook return uses the original per-unit recipe; status changes never deduct again', async () => {
      const m=(await admin.query('SELECT public.restaurant_menu(NULL,$1::jsonb) item',['{"name":"Partial stock","price":10,"no_cook":true}'])).rows[0].item.id
      const recipe=[{ingredient_id:ingredient,quantity:4}]
      await admin.query("SELECT public.restaurant_recipe('add',$1,$2::jsonb,'[]')",[m,JSON.stringify(recipe)])
      const a=await makeTable('Partial return'), oid=await submit(staff,a,[{menu_item_id:m,quantity:1}])
      const before=Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock)
      const id=randomUUID()
      await owner.query("INSERT INTO public.order_items(id,order_id,menu_item_id,name_snapshot,price_snapshot,quantity,no_cook,status) VALUES($1,$2,$3,'Partial',10,3,true,'done')",[id,oid,m])
      await staff.query("SELECT public.restaurant_item($1,'serve')",[id])
      await admin.query("SELECT public.restaurant_recipe('update',$1,$2::jsonb,$3::jsonb)",[m,JSON.stringify([{ingredient_id:ingredient,quantity:9}]),JSON.stringify(recipe)])
      await staff.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'partial')",[oid,JSON.stringify([{id,quantity:1,expected_quantity:3}])])
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before-8)
      await assert.rejects(staff2.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'stale')",[oid,JSON.stringify([{id,quantity:1,expected_quantity:3}])]),/thay đổi/)
      await staff.query("SELECT public.restaurant_adjust($1,'return',$2::jsonb,'remaining')",[oid,JSON.stringify([{id,quantity:2,expected_quantity:2}])])
      assert.equal(Number((await owner.query('SELECT stock FROM public.ingredients WHERE id=$1',[ingredient])).rows[0].stock),before)
    })
    await t.test('phase2 preflight preserves duplicate/invalid recipes and rolls back every schema change', async () => {
      await owner.query('CREATE DATABASE phase2_preflight')
      const other=server.getPgClient('phase2_preflight','127.0.0.1'); await other.connect(); clients.push(other)
      await other.query(fixture.replace('CREATE ROLE anon NOLOGIN;','').replace('CREATE ROLE authenticated NOLOGIN;',''))
      await other.query(guards); await other.query(atomic)
      const m=randomUUID(),i=randomUUID()
      await other.query("INSERT INTO public.menu_items(id,name,price) VALUES($1,'Duplicate recipe',10)",[m])
      await other.query("INSERT INTO public.ingredients(id,name,stock) VALUES($1,'Duplicate ingredient',100)",[i])
      await other.query('INSERT INTO public.recipes(menu_item_id,ingredient_id,quantity) VALUES($1,$2,1),($1,$2,2)',[m,i])
      await assert.rejects(other.query(phase2),/invalid or duplicate recipes/); await other.query('ROLLBACK')
      assert.equal((await other.query('SELECT count(*) FROM public.recipes')).rows[0].count,'2')
      assert.equal((await other.query("SELECT to_regclass('restaurant_private.item_stock') id")).rows[0].id,null)
      assert.equal((await other.query("SELECT to_regclass('public.recipes_one_ingredient_per_menu') id")).rows[0].id,null)
      await other.query('DELETE FROM public.recipes WHERE quantity=2'); await other.query('UPDATE public.recipes SET ingredient_id=NULL')
      await assert.rejects(other.query(phase2),/invalid or duplicate recipes/); await other.query('ROLLBACK')
      assert.equal((await other.query('SELECT ingredient_id FROM public.recipes')).rows[0].ingredient_id,null)
      assert.equal((await other.query('SELECT stock FROM public.ingredients')).rows[0].stock,'100')
    })
    await t.test('phase2 text limits do not reject a legitimate large payment snapshot', async () => {
      const a=await makeTable('Large bill'), oid=await submit(staff,a,[{menu_item_id:ready,quantity:80}])
      const q=await quote(staff,oid)
      assert.ok(JSON.stringify(q).length>10000)
      const result=await payment(staff,oid,'confirm_cash',q.fingerprint)
      assert.equal(result.items.length,80)
      assert.equal((await owner.query('SELECT is_paid FROM public.orders WHERE id=$1',[oid])).rows[0].is_paid,true)
    })
    await t.test('phase2 synthetic backup restores stock snapshots, request keys, RLS and paid invoice snapshots', async () => {
      const names=['auth.users','public.profiles','public.user_roles','public.areas','public.restaurant_tables','public.table_groups',
       'public.categories','public.menu_items','public.ingredients','public.recipes','public.stock_movements','public.orders','public.order_items',
       'public.payment_settings','public.attendance_settings','public.attendance_logs','restaurant_private.submit_requests','restaurant_private.item_stock','restaurant_private.stock_requests']
      const data={}
      await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      try { for(const name of names) data[name]=(await owner.query(`SELECT * FROM ${name}`)).rows } finally { await owner.query('COMMIT') }
      const path=join(directory,'phase2-synthetic-backup.json')
      await writeFile(path,JSON.stringify({fixture,guards,atomic,phase2,validation,data}),'utf8')
      const backup=JSON.parse(await readFile(path,'utf8'))
      await owner.query('CREATE DATABASE phase2_restored')
      const restored=server.getPgClient('phase2_restored','127.0.0.1'); await restored.connect(); clients.push(restored)
      await restored.query(backup.fixture.replace('CREATE ROLE anon NOLOGIN;','').replace('CREATE ROLE authenticated NOLOGIN;',''))
      for(const migration of [backup.guards,backup.atomic,backup.phase2,backup.validation]) await restored.query(migration)
      await restored.query('BEGIN; SET LOCAL session_replication_role=replica')
      try {
       for(const name of names) await restored.query(`DELETE FROM ${name}`)
       for(const name of names) await restored.query(`INSERT INTO ${name} SELECT * FROM jsonb_populate_recordset(NULL::${name},$1::jsonb)`,[JSON.stringify(backup.data[name])])
       await restored.query('COMMIT')
      } catch(error) { await restored.query('ROLLBACK'); throw error }
      for(const name of names) assert.equal(Number((await restored.query(`SELECT count(*) FROM ${name}`)).rows[0].count),backup.data[name].length)
      assert.deepEqual((await restored.query('SELECT payment_snapshot FROM public.orders WHERE id=$1',[order])).rows[0].payment_snapshot,settled)
      assert.deepEqual((await restored.query('SELECT * FROM restaurant_private.item_stock ORDER BY item_id')).rows,(await owner.query('SELECT * FROM restaurant_private.item_stock ORDER BY item_id')).rows)
      await restored.query('SET ROLE authenticated'); await restored.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users.staff])
      await assert.rejects(restored.query('UPDATE public.ingredients SET stock=0'),/permission denied/)
      await assert.rejects(restored.query('SELECT * FROM restaurant_private.item_stock'),/permission denied/)
    })
    await t.test('phase2 validation preserves unchanged legacy profile fields during an avatar-only upsert', async () => {
      // Seed the legacy value using a disabled validation trigger in this
      // isolated fixture only. No production row or account is touched.
      await owner.query('ALTER TABLE public.profiles DISABLE TRIGGER phase2_validate')
      await owner.query('UPDATE public.profiles SET username=$1 WHERE id=$2',['legacy+name',users.otherStaff])
      await owner.query('ALTER TABLE public.profiles ENABLE TRIGGER phase2_validate')
      const p=(await owner.query('SELECT * FROM public.profiles WHERE id=$1',[users.otherStaff])).rows[0]
      await staff2.query('INSERT INTO public.profiles(id,username,full_name,phone,avatar_url) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET avatar_url=excluded.avatar_url',
        [p.id,p.username,p.full_name,p.phone,'https://example.com/avatar.png'])
      assert.equal((await owner.query('SELECT username,phone FROM public.profiles WHERE id=$1',[p.id])).rows[0].username,'legacy+name')
      await assert.rejects(staff2.query('UPDATE public.profiles SET username=$1 WHERE id=$2',['new@invalid',p.id]),/đăng nhập/)
    })
    await owner.query('BEGIN READ ONLY')
    try { await owner.query(await readFile(new URL('./preflight-phase3.sql', import.meta.url),'utf8')) } finally { await owner.query('ROLLBACK') }
    await owner.query(phase3)
    await t.test('phase3 resolves current table membership and kitchen changes without client cached groups', async () => {
      const a=await makeTable('Fresh membership A'),b=await makeTable('Fresh membership B')
      await staff.query('SELECT public.restaurant_merge($1,$2)',[a,b])
      const oid=await submit(staff,b)
      const read=async(c,id)=>(await c.query('SELECT public.restaurant_open_order($1) result',[id])).rows[0].result
      assert.equal((await read(cashier,a)).id,oid)
      const item=(await read(kitchen,b)).order_items[0]
      await kitchen.query("SELECT public.restaurant_item($1,'start')",[item.id])
      await kitchen.query("SELECT public.restaurant_item($1,'finish')",[item.id])
      assert.equal((await read(staff,a)).order_items[0].status,'done')
      await staff.query("SELECT public.restaurant_item($1,'serve')",[item.id])
      assert.equal((await read(cashier,b)).order_items[0].status,'served')
      await payment(cashier,oid,'confirm_cash',(await quote(cashier,oid)).fingerprint)
      await staff.query('SELECT public.restaurant_release($1,true)',[a])
      assert.equal(await read(staff,a),null)
      const fresh=await submit(staff,b)
      assert.equal(await read(staff,a),null)
      assert.equal((await read(staff,b)).id,fresh)
    })
    await t.test('phase3 attendance uses server distance/time, role checks and Vietnam day sequencing', async () => {
      await owner.query('UPDATE public.attendance_settings SET latitude=10,longitude=106,radius_m=100 WHERE id=1')
      const punch=(c,kind,lat=10,lon=106,key=randomUUID())=>c.query('SELECT public.restaurant_attendance($1,$2,$3,$4) result',[kind,lat,lon,key])
      await assert.rejects(staff.query("INSERT INTO public.attendance_logs(user_id,kind) VALUES($1,'in')",[users.staff]),/permission denied/)
      await assert.rejects(punch(admin,'in'),/permission|quyền|role|forbidden/i)
      await assert.rejects(punch(staff,'in',11,106),/phạm vi/)
      await assert.rejects(punch(staff,'in','NaN',106),/không hợp lệ/)
      await assert.rejects(punch(staff,'out'),/Trạng thái/)
      const key=randomUUID(), first=(await punch(staff,'in',10,106,key)).rows[0].result
      assert.equal(first.user_id,users.staff); assert.equal(Number(first.distance_m),0)
      assert.ok(Math.abs(Date.now()-Date.parse(first.at))<5000)
      assert.deepEqual((await punch(staff,'in',10,106,key)).rows[0].result,first)
      await assert.rejects(punch(staff,'in'),/Trạng thái/)
      await punch(staff,'out'); await assert.rejects(punch(staff,'in'),/Trạng thái/)
      const outcomes=await Promise.allSettled([punch(staff2,'in'),punch(staff2,'in')])
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
      assert.equal((await owner.query('SELECT count(*) FROM public.attendance_logs WHERE user_id=$1',[users.otherStaff])).rows[0].count,'1')
    })
    await t.test('phase3 protects the last admin and atomically rolls back profile and role changes', async () => {
      await assert.rejects(owner.query('DELETE FROM auth.users WHERE id=$1',[users.admin]),/Admin cuối cùng/)
      await assert.rejects(owner.query("UPDATE public.user_roles SET role='staff' WHERE user_id=$1",[users.admin]),/Admin cuối cùng/)
      const original=(await owner.query('SELECT full_name FROM public.profiles WHERE id=$1',[users.admin])).rows[0].full_name
      await assert.rejects(admin.query("SELECT public.restaurant_staff($1,$2::jsonb,'staff')",[users.admin,JSON.stringify({full_name:'Should roll back'})]),/Admin cuối cùng/)
      assert.equal((await owner.query('SELECT full_name FROM public.profiles WHERE id=$1',[users.admin])).rows[0].full_name,original)
      await assert.rejects(staff.query("SELECT public.restaurant_staff($1,'{}','cashier')",[users.kitchen]),/permission|quyền|role|forbidden/i)
      await admin.query("SELECT public.restaurant_staff($1,$2::jsonb,'cashier')",[users.kitchen,JSON.stringify({full_name:'Changed atomically'})])
      assert.equal((await owner.query('SELECT role FROM public.user_roles WHERE user_id=$1',[users.kitchen])).rows[0].role,'cashier')
      await assert.rejects(admin.query("SELECT public.restaurant_staff($1,'{}','admin')",[users.kitchen]),/quyền/)
      const id=randomUUID(); await owner.query('INSERT INTO auth.users VALUES($1,$2)',[id,'synthetic'])
      await assert.rejects(admin.query("SELECT public.restaurant_staff($1,$2::jsonb,'staff',true)",[id,JSON.stringify({username:'bad@name',full_name:'Failed'})]),/đăng nhập/)
      assert.equal((await owner.query('SELECT count(*) FROM public.profiles WHERE id=$1',[id])).rows[0].count,'0')
      assert.equal((await owner.query('SELECT count(*) FROM public.user_roles WHERE user_id=$1',[id])).rows[0].count,'0')
    })
    await t.test('phase3 attendance midway failure leaves neither log nor retry record',async()=>{
      await owner.query("DELETE FROM public.attendance_logs WHERE user_id=$1",[users.kitchen])
      const key=randomUUID()
      await owner.query("CREATE FUNCTION public.fail_attendance_request() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic attendance failure'; END$$")
      await owner.query('CREATE TRIGGER fail_attendance_request BEFORE INSERT ON restaurant_private.attendance_requests FOR EACH ROW EXECUTE FUNCTION public.fail_attendance_request()')
      await assert.rejects(kitchen.query("SELECT public.restaurant_attendance('in',10,106,$1)",[key]),/synthetic attendance failure/)
      assert.equal((await owner.query('SELECT count(*) FROM public.attendance_logs WHERE user_id=$1',[users.kitchen])).rows[0].count,'0')
      assert.equal((await owner.query('SELECT count(*) FROM restaurant_private.attendance_requests WHERE request_id=$1',[key])).rows[0].count,'0')
      await owner.query('DROP TRIGGER fail_attendance_request ON restaurant_private.attendance_requests; DROP FUNCTION public.fail_attendance_request()')
      await kitchen.query("SELECT public.restaurant_attendance('in',10,106,$1)",[key])
    })
    await t.test('phase3 reapplication preserves attendance ledger, history, and existing stock triggers',async()=>{
      const before=(await owner.query('SELECT * FROM restaurant_private.attendance_requests ORDER BY actor_id,request_id')).rows
      await owner.query(phase3)
      assert.deepEqual((await owner.query('SELECT * FROM restaurant_private.attendance_requests ORDER BY actor_id,request_id')).rows,before)
      assert.deepEqual((await owner.query('SELECT payment_snapshot FROM public.orders WHERE id=$1',[oldOrder])).rows[0].payment_snapshot,null)
      assert.equal((await owner.query("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.order_items'::regclass AND tgname IN ('trg_deduct_stock_insert','trg_restore_stock_update','trg_restore_stock_delete')")).rows[0].count,'3')
      await assert.rejects(staff.query("INSERT INTO public.attendance_logs(user_id,kind) VALUES($1,'in')",[users.staff]),/permission denied/)
    })
    await t.test('phase3 concurrent removal of two admins leaves one admin and a failed transaction intact',async()=>{
      const second=randomUUID()
      await owner.query('INSERT INTO auth.users VALUES($1,$2)',[second,'synthetic'])
      await owner.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[second])
      const other=server.getPgClient('postgres','127.0.0.1');await other.connect();clients.push(other)
      const results=await Promise.allSettled([
        owner.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='admin'",[users.admin]),
        other.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='admin'",[second]),
      ])
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
      assert.equal((await owner.query("SELECT count(*) FROM public.user_roles WHERE role='admin'")).rows[0].count,'1')
      if (!(await owner.query("SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role='admin'",[users.admin])).rowCount) {
        await owner.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[users.admin])
        await owner.query('DELETE FROM auth.users WHERE id=$1',[second])
      }
    })
  } catch (error) { console.error(error); throw error } finally {
    await Promise.allSettled(clients.map(c=>c.end()))
    if (started) await server.stop()
    // Keep synthetic data directory for diagnostics; never remove user paths.
  }
})
