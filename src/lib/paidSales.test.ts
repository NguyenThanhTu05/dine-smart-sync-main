import { expect,it } from 'vitest'
import { paidSales } from '../../supabase/functions/_shared/paidSales'
const item={menu_item_id:'one',name_snapshot:'Cùng tên',quantity:2}
it('uses frozen paid items, excludes unpaid rows and keeps different menu IDs separate',()=>{
  expect(paidSales([
    {is_paid:false,order_items:[{...item,quantity:100}]},
    {is_paid:true,payment_snapshot:{version:1,items:[item]},order_items:[{...item,quantity:99}]},
    {is_paid:true,order_items:[{...item,menu_item_id:'two',quantity:3}]},
  ])).toEqual([{menu_item_id:'two',name:'Cùng tên',qty:3},{menu_item_id:'one',name:'Cùng tên',qty:2}])
})
it('fails on invalid historical quantities instead of silently distorting counts',()=>{
  expect(()=>paidSales([{order_items:[{...item,quantity:NaN}]}])).toThrow('đối soát')
})
