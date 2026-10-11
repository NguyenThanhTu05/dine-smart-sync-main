import { loadPaidReport } from '../_shared/loadPaidReport.ts';
import { validateArguments, parseMessages, parseAssistantResponse, type InferSchema, type ChatMessage } from '../_shared/aiProtocol.ts';
import { paidSales } from '../_shared/paidSales.ts';
import { createStaff } from '../_shared/createStaff.ts';
import { requiredText, passwordInput, usernameInput, phoneInput } from '../_shared/inputValidation.ts';
import { resolveTarget, TargetSelectionError } from '../_shared/resolveTarget.ts';
import type { Database, Tables, TablesUpdate, Json } from "../_shared/database.types.ts";
import { summarizePaidRevenue } from "../_shared/invoiceRevenue.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY);

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

// ============ TOOL DEFINITIONS ============
const tools = [
  // ---- Analytics ----
  {
    type: "function", function: {
      name: "get_revenue",
      description: "Doanh thu các order đã thanh toán (đã tính VAT, phí dịch vụ, giảm giá). period: today|yesterday|this_week|this_month|custom.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "yesterday", "this_week", "this_month", "custom"] },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function", function: {
      name: "top_selling_items",
      description: "Top món bán chạy theo số ngày gần nhất.",
      parameters: { type: "object", properties: { days: { type: "number" }, limit: { type: "number" } } },
    },
  },
  {
    type: "function", function: {
      name: "list_bills",
      description: "Liệt kê hóa đơn đã thanh toán trong khoảng ngày.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "yesterday", "this_week", "this_month", "custom"] },
          from: { type: "string" }, to: { type: "string" }, limit: { type: "number" },
        },
      },
    },
  },

  // ---- Tables / Areas ----
  { type: "function", function: { name: "list_tables_status", description: "Liệt kê tất cả bàn + trạng thái + thông tin ghép bàn.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_areas", description: "Liệt kê các khu vực.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "add_area", description: "Thêm khu vực mới.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "update_area", description: "Đổi tên khu vực.", parameters: { type: "object", properties: { match: { type: "string" }, new_name: { type: "string" } }, required: ["match", "new_name"] } } },
  { type: "function", function: { name: "delete_area", description: "Xóa khu vực. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },
  { type: "function", function: { name: "add_table", description: "Thêm bàn vào khu vực.", parameters: { type: "object", properties: { name: { type: "string" }, area: { type: "string" }, seats: { type: "number" } }, required: ["name"] } } },
  {
    type: "function", function: {
      name: "update_table",
      description: "Sửa bàn (tên/sức chứa/trạng thái).",
      parameters: {
        type: "object",
        properties: {
          match: { type: "string" }, new_name: { type: "string" }, seats: { type: "number" },
          status: { type: "string", enum: ["empty", "serving", "awaiting_payment", "needs_cleanup"] },
        },
        required: ["match"],
      },
    },
  },
  { type: "function", function: { name: "delete_table", description: "Xóa bàn. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },

  // ---- Menu / Categories ----
  { type: "function", function: { name: "list_menu", description: "Liệt kê món, có thể lọc theo tên. Trả về cả trường no_cook (không cần bếp) và recipe (công thức).", parameters: { type: "object", properties: { search: { type: "string" } } } } },
  { type: "function", function: { name: "list_categories", description: "Liệt kê danh mục.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "add_category", description: "Thêm danh mục.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "delete_category", description: "Xóa danh mục. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },
  {
    type: "function", function: {
      name: "add_menu_item",
      description: "Thêm món. category là tên hoặc id (tự tạo nếu chưa có). no_cook=true: không bắn lệnh bếp (món có sẵn). recipe: công thức/ghi chú chế biến.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" }, price: { type: "number" }, category: { type: "string" },
          is_available: { type: "boolean" },
          no_cook: { type: "boolean", description: "true = không cần chế biến, không bắn bếp" },
          recipe: { type: "string", description: "Công thức hoặc ghi chú chế biến" },
        },
        required: ["name", "price"],
      },
    },
  },
  {
    type: "function", function: {
      name: "update_menu_item",
      description: "Sửa món (đổi tên/giá/available/no_cook/recipe).",
      parameters: {
        type: "object",
        properties: {
          match: { type: "string" }, new_name: { type: "string" }, new_price: { type: "number" },
          is_available: { type: "boolean" },
          no_cook: { type: "boolean", description: "true = không cần chế biến" },
          recipe: { type: "string", description: "Công thức/ghi chú chế biến" },
        },
        required: ["match"],
      },
    },
  },
  { type: "function", function: { name: "delete_menu_item", description: "Xóa món. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },
  // ---- Ingredients / Recipes ----
  { type: "function", function: { name: "list_ingredients", description: "Liệt kê nguyên liệu.", parameters: { type: "object", properties: { search: { type: "string" } } } } },
  { type: "function", function: { name: "list_low_stock", description: "Nguyên liệu sắp hết (stock < min_stock).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "add_ingredient", description: "Thêm nguyên liệu mới.", parameters: { type: "object", properties: { name: { type: "string" }, unit: { type: "string" }, stock: { type: "number" }, min_stock: { type: "number" } }, required: ["name"] } } },
  {
    type: "function", function: {
      name: "update_ingredient",
      description: "Sửa nguyên liệu.",
      parameters: {
        type: "object",
        properties: { match: { type: "string" }, new_name: { type: "string" }, unit: { type: "string" }, min_stock: { type: "number" }, set_stock: { type: "number" } },
        required: ["match"],
      },
    },
  },
  {
    type: "function", function: {
      name: "adjust_stock",
      description: "Nhập/xuất kho: delta dương = nhập, âm = xuất.",
      parameters: { type: "object", properties: { match: { type: "string" }, delta: { type: "number" }, reason: { type: "string" } }, required: ["match", "delta"] },
    },
  },
{ type: "function", function: { name: "delete_ingredient", description: "Xóa nguyên liệu. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },
  {
    type: "function", function: {
      name: "set_recipe",
      description: "Đặt định mức nguyên liệu cho 1 món (xóa cũ, ghi mới).",
      parameters: {
        type: "object",
        properties: {
          menu_item: { type: "string" },
          items: { type: "array", items: { type: "object", properties: { ingredient: { type: "string" }, quantity: { type: "number" } }, required: ["ingredient", "quantity"] } },
        },
        required: ["menu_item", "items"],
      },
    },
  },
  { type: "function", function: { name: "get_recipe", description: "Xem định mức nguyên liệu của 1 món.", parameters: { type: "object", properties: { menu_item: { type: "string" } }, required: ["menu_item"] } } },

  // ---- Payment settings ----
  { type: "function", function: { name: "get_payment_settings", description: "Xem cài đặt thanh toán & bill (VAT, phí dịch vụ, giảm giá chung, thông tin quán, ngân hàng).", parameters: { type: "object", properties: {} } } },
  {
    type: "function", function: {
      name: "update_payment_settings",
      description: "Cập nhật cài đặt thanh toán & bill.",
      parameters: {
        type: "object",
        properties: {
          shop_name: { type: "string" }, address: { type: "string" }, phone: { type: "string" },
          tax_code: { type: "string" }, slogan: { type: "string" },
          bank_name: { type: "string" }, account_holder: { type: "string" }, account_number: { type: "string" },
          vat_percent: { type: "number" }, service_percent: { type: "number" },
          global_discount_percent: { type: "number", description: "Giảm giá chung áp dụng tự động cho mọi bàn (%)" },
          footer_note: { type: "string" }, policy_note: { type: "string" },
        },
      },
    },
  },

  // ---- Staff ----
  { type: "function", function: { name: "list_staff", description: "Liệt kê nhân viên.", parameters: { type: "object", properties: {} } } },
  {
    type: "function", function: {
      name: "create_staff",
      description: "Tạo nhân viên mới.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" }, password: { type: "string" }, full_name: { type: "string" },
          username: { type: "string" }, role: { type: "string", enum: ["admin", "cashier", "kitchen", "staff"] }, phone: { type: "string" },
        },
        required: ["email", "password", "role"],
      },
    },
  },
  {
    type: "function", function: {
      name: "update_staff",
      description: "Sửa thông tin nhân viên.",
      parameters: {
        type: "object",
        properties: {
          match: { type: "string" }, full_name: { type: "string" }, phone: { type: "string" },
          role: { type: "string", enum: ["admin", "cashier", "kitchen", "staff"] },
        },
        required: ["match"],
      },
    },
  },
  { type: "function", function: { name: "delete_staff", description: "Xóa nhân viên. Lần gọi đầu không set confirmed sẽ trả về câu hỏi xác nhận, không xóa.", parameters: { type: "object", properties: { match: { type: "string" }, confirmed: { type: "boolean", description: "true = đã được user xác nhận, thực thi xóa" } }, required: ["match"] } } },

  // ---- Attendance ----
  { type: "function", function: { name: "get_attendance_settings", description: "Vị trí và bán kính điểm danh.", parameters: { type: "object", properties: {} } } },
  {
    type: "function", function: {
      name: "update_attendance_settings",
      description: "Cập nhật vị trí/bán kính điểm danh.",
      parameters: { type: "object", properties: { latitude: { type: "number" }, longitude: { type: "number" }, radius_m: { type: "number" } } },
    },
  },
  {
    type: "function", function: {
      name: "list_attendance",
      description: "Xem log điểm danh.",
      parameters: {
        type: "object",
        properties: {
          staff: { type: "string" },
          period: { type: "string", enum: ["today", "yesterday", "this_week", "this_month", "custom"] },
          from: { type: "string" }, to: { type: "string" }, limit: { type: "number" },
        },
      },
    },
  },
 ] as const;

type Definition = typeof tools[number]["function"];
type Invocation = { [D in Definition as D["name"]]: { name: D["name"]; args: InferSchema<D["parameters"]> } }[Definition["name"]];
function invocation(name: string, value: unknown): Invocation {
  const definition = tools.find(tool => tool.function.name === name)?.function;
  if (!definition) throw new Error("Tool không hợp lệ");
  validateArguments(definition.parameters, value);
  return { name, args: value } as Invocation;
}

// ============ HELPERS ============
function periodRange(period: string, from?: string, to?: string) {
  const now = new Date();
  const tz = 7 * 60;
  const localNow = new Date(now.getTime() + tz * 60_000);
  const y = localNow.getUTCFullYear(), m = localNow.getUTCMonth(), d = localNow.getUTCDate();
  const startOfDay = (dt: Date) => new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) - tz * 60_000);
  let start: Date, end: Date;
  if (period === "today") { start = startOfDay(localNow); end = new Date(start.getTime() + 86400_000); }
  else if (period === "yesterday") { end = startOfDay(localNow); start = new Date(end.getTime() - 86400_000); }
  else if (period === "this_week") {
    const day = (localNow.getUTCDay() + 6) % 7;
    const mon = new Date(Date.UTC(y, m, d - day));
    start = new Date(mon.getTime() - tz * 60_000); end = new Date(start.getTime() + 7 * 86400_000);
  } else if (period === "this_month") {
    start = new Date(Date.UTC(y, m, 1) - tz * 60_000);
    end = new Date(Date.UTC(y, m + 1, 1) - tz * 60_000);
  } else {
    start = from ? new Date(from + "T00:00:00+07:00") : new Date(0);
    end = to ? new Date(new Date(to + "T00:00:00+07:00").getTime() + 86400_000) : new Date();
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

type NamedTable = 'areas' | 'categories' | 'restaurant_tables' | 'menu_items' | 'ingredients';
async function targetRows<T extends NamedTable>(db: ReturnType<typeof createClient<Database>>, table: T): Promise<Tables<T>[]> {
  const rows: Tables<T>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Tables<T>[]));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}
async function findRow<T extends NamedTable>(db: ReturnType<typeof createClient<Database>>, table: T, match: string) {
  return resolveTarget(await targetRows(db, table), match, row => [row.name]);
}
async function findProfile(db: ReturnType<typeof createClient<Database>>, match: string) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const {data,error} = await db.from('profiles').select('id,username,full_name,phone,address,birthday,hire_date,avatar_url,hide_personal').order('id').range(offset,offset+999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0)<1000) break;
  }
  return resolveTarget(rows, match, row => [row.full_name ?? '', row.username ?? '']);
}

async function getCategoryId(db: ReturnType<typeof createClient<Database>>, category: string): Promise<string | null> {
  const rows = await targetRows(db, "categories");
  let target;
  try { target = resolveTarget(rows, category, row => [row.name]); }
  catch (error) {
    if (!(error instanceof TargetSelectionError) || error.candidates.length) throw error;
    const { data, error: insertError } = await db.from("categories").insert({ name: requiredText(category, "Danh mục") }).select("id").single();
    if (insertError) throw insertError;
    return data.id;
  }
  return target.id;
}

async function paidReport(db: ReturnType<typeof createClient<Database>>,start:string,end:string) {
  return await loadPaidReport(
    (offset,last) => db.from('orders').select('id,total,paid_at,payment_snapshot')
      .eq('is_paid',true).gte('paid_at',start).lt('paid_at',end).order('id').range(offset,last),
    (ids,offset,last) => db.from('order_items').select('order_id,menu_item_id,name_snapshot,quantity')
      .in('order_id',ids).order('id').range(offset,last),
  );
}

// ============ TOOL HANDLERS ============
async function runTool(call: Invocation, db: ReturnType<typeof createClient<Database>>): Promise<unknown> {
  switch (call.name) {

    // ===== Analytics =====
    case "get_revenue": {
      const args = call.args;
      const { start, end } = periodRange(args.period, args.from, args.to);
      // FIX: lấy thêm discount_percent để tính đúng như Dashboard
      const paidOrders = await paidReport(db,start,end);
      return { period: args.period, from: start, to: end, order_count: paidOrders.length, ...summarizePaidRevenue(paidOrders) };
    }

    case "top_selling_items": {
      const args = call.args;
      const days = args.days ?? 7;
      if (!Number.isInteger(days) || days<1 || days>3660) return { error: "Khoảng ngày không hợp lệ" };
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const orders = await paidReport(db,since,new Date().toISOString());
      const sorted = paidSales(orders).slice(0, Math.min(100,Math.max(1,args.limit ?? 10)));
      return { days, top: sorted, note: "Chỉ tính đơn đã thanh toán theo paid_at; không tự tính lại số tiền hóa đơn cũ." };
    }

    case "list_bills": {
      const args = call.args;
      const { start, end } = periodRange(args.period ?? "today", args.from, args.to);
      const { data, error } = await db.from("orders")
        .select("id,total,paid_at,payment_method,table_id,discount_percent,payment_snapshot")
        .eq("is_paid", true).gte("paid_at", start).lt("paid_at", end)
        .order("paid_at", { ascending: false }).limit(args.limit ?? 50);
      if (error) return { error: error.message };
      return { from: start, to: end, count: data?.length ?? 0, bills: data, ...summarizePaidRevenue(data ?? []), note: "total lưu tạm tính gốc; số đã thu lấy từ payment_snapshot.total, thiếu snapshot thì cần đối soát." };
    }

    // ===== Tables / Areas =====
    case "list_tables_status": {
      // FIX: thêm merged_group_id để biết bàn nào đang ghép
      const { data, error } = await db.from("restaurant_tables")
        .select("name,status,seats,area_id,merged_group_id,sort_order")
        .order("sort_order");
      if (error) return { error: error.message };
      return { tables: data };
    }

    case "list_areas": {
      const { data, error } = await db.from("areas").select("id,name,sort_order").order("sort_order");
      if (error) return { error: error.message };
      return { areas: data };
    }

    case "add_area": {
      const args = call.args;
      const { data: max } = await db.from("areas").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("areas").insert({ name: args.name, sort_order: (max?.sort_order ?? 0) + 1 }).select().single();
      if (error) return { error: error.message };
      return { ok: true, area: data };
    }

    case "update_area": {
      const args = call.args;
      const a = await findRow(db, "areas", args.match);
      if (!a) return { error: "Không tìm thấy khu vực" };
      const { data, error } = await db.from("areas").update({ name: args.new_name }).eq("id", a.id).select().single();
      if (error) return { error: error.message };
      return { ok: true, area: data };
    }

   case "delete_area": {
      const args = call.args;
      const a = await findRow(db, "areas", args.match);
      if (!a) return { error: "Không tìm thấy khu vực" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa khu vực "${a.name}"? Xác nhận để tiếp tục.` };
      const { error } = await db.from("areas").delete().eq("id", a.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: a.name };
    }

    case "add_table": {
      const args = call.args;
      let area_id: string | null = null;
      if (args.area) { const a = await findRow(db, "areas", args.area); area_id = a?.id ?? null; }
      const { data: max } = await db.from("restaurant_tables").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("restaurant_tables")
        .insert({ name: args.name, area_id, seats: args.seats ?? 4, sort_order: (max?.sort_order ?? 0) + 1 })
        .select().single();
      if (error) return { error: error.message };
      return { ok: true, table: data };
    }

    case "update_table": {
      const args = call.args;
      const t = await findRow(db, "restaurant_tables", args.match);
      if (!t) return { error: "Không tìm thấy bàn" };
      const upd: Record<string, Json | undefined> = {};
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.seats !== undefined) upd.seats = args.seats;
      if (args.status !== undefined) upd.status = args.status;
      const { data, error } = await db.rpc("restaurant_edit_table", { p_table: t.id, p_patch: upd });
      if (error) return { error: error.message };
      return { ok: true, table: data };
    }

 case "delete_table": {
      const args = call.args;
      const t = await findRow(db, "restaurant_tables", args.match);
      if (!t) return { error: "Không tìm thấy bàn" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa bàn "${t.name}"? Xác nhận để tiếp tục.` };
      const { error } = await db.from("restaurant_tables").delete().eq("id", t.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: t.name };
    }

    // ===== Menu =====
    case "list_menu": {
      const args = call.args;
      // FIX: thêm no_cook, recipe vào select
      const { data, error } = await db.from("menu_items")
        .select("id,name,price,is_available,category_id,no_cook,recipe").order("name");
      if (error) return { error: error.message };
      const s = norm(args.search || "");
      const items = s ? (data ?? []).filter((x) => norm(x.name).includes(s)) : data;
      return { items };
    }

    case "list_categories": {
      const { data, error } = await db.from("categories").select("id,name,sort_order").order("sort_order");
      if (error) return { error: error.message };
      return { categories: data };
    }

    case "add_category": {
      const args = call.args;
      const { data: existing } = await db.from("categories").select("*").ilike("name", args.name).maybeSingle();
      if (existing) return { ok: true, note: "Đã tồn tại", category: existing };
      const { data: max } = await db.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("categories").insert({ name: args.name, sort_order: (max?.sort_order ?? 0) + 1 }).select().single();
      if (error) return { error: error.message };
      return { ok: true, category: data };
    }
case "delete_category": {
      const args = call.args;
      const c = await findRow(db, "categories", args.match);
      if (!c) return { error: "Không tìm thấy danh mục" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa danh mục "${c.name}"? Xác nhận để tiếp tục.` };
      const { error } = await db.from("categories").delete().eq("id", c.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: c.name };
    }

    case "add_menu_item": {
      const args = call.args;
      const category_id = args.category ? await getCategoryId(db, args.category) : null;
      // FIX: thêm no_cook và recipe
      const { data, error } = await db.rpc("restaurant_menu", { p_id: null, p_data: {
        name: args.name, price: args.price, category_id,
        is_available: args.is_available ?? true,
        no_cook: args.no_cook ?? false,
        recipe: args.recipe ?? null,
      } });
      if (error) return { error: error.message };
      return { ok: true, item: data };
    }

    case "update_menu_item": {
      const args = call.args;
      const item = await findRow(db, "menu_items", args.match);
      if (!item) return { error: `Không tìm thấy món "${args.match}"` };
      const upd: Record<string, Json | undefined> = {};
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.new_price !== undefined) upd.price = args.new_price;
      if (args.is_available !== undefined) upd.is_available = args.is_available;
      // FIX: thêm no_cook và recipe
      if (args.no_cook !== undefined) upd.no_cook = args.no_cook;
      if (args.recipe !== undefined) upd.recipe = args.recipe;
      if (Object.keys(upd).length === 0) return { error: "Không có gì để sửa" };
      const { data, error } = await db.rpc("restaurant_menu", { p_id: item.id, p_data: upd, p_expected: item });
      if (error) return { error: error.message };
      return { ok: true, item: data };
    }

case "delete_menu_item": {
      const args = call.args;
      const item = await findRow(db, "menu_items", args.match);
      if (!item) return { error: `Không tìm thấy món "${args.match}"` };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa món "${item.name}"? Xác nhận để tiếp tục.` };
      const { error } = await db.from("menu_items").delete().eq("id", item.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: item.name };
    }

    // ===== Ingredients =====
    case "list_ingredients": {
      const args = call.args;
      const { data, error } = await db.from("ingredients").select("id,name,unit,stock,min_stock").order("name");
      if (error) return { error: error.message };
      const s = norm(args.search || "");
      const items = s ? (data ?? []).filter((x) => norm(x.name).includes(s)) : data;
      return { ingredients: items };
    }

    case "list_low_stock": {
      const { data, error } = await db.from("ingredients").select("name,unit,stock,min_stock");
      if (error) return { error: error.message };
      // FIX: dùng < thay vì <= để khớp với Dashboard và MenuAndInventory
      return { low_stock: (data ?? []).filter((x) => Number(x.stock) < Number(x.min_stock)) };
    }

    case "add_ingredient": {
      const args = call.args;
      const { data, error } = await db.rpc("restaurant_stock", { p_action: "create", p_id: null, p_request: crypto.randomUUID(),
        p_data: { name: args.name, unit: args.unit ?? "g", stock: args.stock ?? 0, min_stock: args.min_stock ?? 0 } });
      if (error) return { error: error.message };
      return { ok: true, ingredient: data };
    }

    case "update_ingredient": {
      const args = call.args;
      const ing = await findRow(db, "ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      const upd = { name: ing.name, unit: ing.unit, stock: ing.stock, min_stock: ing.min_stock, expected_stock: ing.stock, expected: ing };
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.unit !== undefined) upd.unit = args.unit;
      if (args.min_stock !== undefined) upd.min_stock = args.min_stock;
      if (args.set_stock !== undefined) upd.stock = args.set_stock;
      const { data, error } = await db.rpc("restaurant_stock", { p_action: "edit", p_id: ing.id, p_data: upd, p_request: crypto.randomUUID() });
      if (error) return { error: error.message };
      return { ok: true, ingredient: data };
    }

    case "adjust_stock": {
      const args = call.args;
      const ing = await findRow(db, "ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      const { data, error } = await db.rpc("restaurant_stock", { p_action: "adjust", p_id: ing.id, p_request: crypto.randomUUID(), p_data: { delta: args.delta, reason: args.reason ?? "AI assistant" } });
      if (error) return { error: error.message };
      return { ok: true, ingredient: data };
    }
case "delete_ingredient": {
      const args = call.args;
      const ing = await findRow(db, "ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa nguyên liệu "${ing.name}"? Xác nhận để tiếp tục.` };
      const { error } = await db.rpc("restaurant_stock", { p_action: "delete", p_id: ing.id, p_data: {}, p_request: crypto.randomUUID() });
      if (error) return { error: error.message };
      return { ok: true, deleted: ing.name };
    }

    case "set_recipe": {
      const args = call.args;
      const item = await findRow(db, "menu_items", args.menu_item);
      if (!item) return { error: "Không tìm thấy món" };
      const { data: previous, error: readError } = await db.from("recipes").select("ingredient_id,quantity").eq("menu_item_id", item.id).order("ingredient_id");
      if (readError) return { error: readError.message };
      const rows: { ingredient_id: string; quantity: number }[] = [];
      for (const r of (args.items ?? [])) {
        const ing = await findRow(db, "ingredients", r.ingredient);
        if (!ing) return { error: `Không tìm thấy nguyên liệu: ${r.ingredient}` };
        rows.push({ ingredient_id: ing.id, quantity: r.quantity });
      }
      const { error } = await db.rpc("restaurant_recipe", { p_action: "replace", p_menu: item.id, p_rows: rows, p_expected: previous ?? [] });
      if (error) return { error: error.message };
      return { ok: true, menu_item: item.name, count: rows.length };
    }

    case "get_recipe": {
      const args = call.args;
      const item = await findRow(db, "menu_items", args.menu_item);
      if (!item) return { error: "Không tìm thấy món" };
      const { data: rec } = await db.from("recipes").select("ingredient_id,quantity").eq("menu_item_id", item.id);
      const ingIds = (rec ?? []).map((r) => r.ingredient_id);
      const { data: ings } = await db.from("ingredients").select("id,name,unit")
        .in("id", ingIds.length ? ingIds : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((ings ?? []).map((i) => [i.id, i]));
      return {
        menu_item: item.name,
        recipe: (rec ?? []).map((r) => ({
          ingredient: map.get(r.ingredient_id ?? "")?.name,
          unit: map.get(r.ingredient_id ?? "")?.unit,
          quantity: r.quantity,
        })),
      };
    }

    // ===== Payment settings =====
    case "get_payment_settings": {
      const { data, error } = await db.from("payment_settings").select("*").eq("id", 1).maybeSingle();
      if (error) return { error: error.message };
      return { settings: data };
    }

    case "update_payment_settings": {
      const args = call.args;
      // FIX: thêm global_discount_percent
      const fields = [
        "shop_name", "address", "phone", "tax_code", "slogan",
        "bank_name", "account_holder", "account_number",
        "vat_percent", "service_percent", "global_discount_percent",
        "footer_note", "policy_note",
      ] as const;
      const upd: TablesUpdate<"payment_settings"> = { updated_at: new Date().toISOString() };
      for (const f of fields) if (args[f] !== undefined) Object.assign(upd, { [f]: args[f] });
      const { data, error } = await db.from("payment_settings").update(upd).eq("id", 1).select().single();
      if (error) return { error: error.message };
      return { ok: true, settings: data };
    }

    // ===== Staff =====
    case "list_staff": {
      const { data: profiles } = await db.from("profiles").select("id,username,full_name,phone");
      const { data: roles } = await db.from("user_roles").select("user_id,role");
      const map = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      return { staff: (profiles ?? []).map((p) => ({ ...p, role: map.get(p.id) ?? null })) };
    }

    case "create_staff": {
      const args = call.args;
      args.password = passwordInput(args.password);
      args.username = usernameInput(args.username ?? args.email?.split('@')[0]);
      args.full_name = requiredText(args.full_name ?? args.username, 'Họ tên');
      args.phone = phoneInput(args.phone);
      if (typeof args.email !== 'string' || args.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) return { error: 'Email không hợp lệ' };
      if (!["staff","cashier","kitchen"].includes(args.role)) return { error: "Vai trò không hợp lệ" };
      const uid = await createStaff(
        () => admin.auth.admin.createUser({ email: args.email, password: args.password, email_confirm: true, user_metadata: { full_name: args.full_name ?? args.username ?? args.email } }),
        id => db.rpc('restaurant_staff', { p_user: id, p_profile: { username: args.username ?? args.email.split('@')[0], full_name: args.full_name ?? args.username ?? args.email, phone: args.phone ?? null }, p_role: args.role, p_initialize: true }),
        id => admin.auth.admin.deleteUser(id),
      );
      return { ok: true, user_id: uid, email: args.email, role: args.role };
    }

    case "update_staff": {
      const args = call.args;
      const p = await findProfile(db, args.match);
      if (!p) return { error: "Không tìm thấy nhân viên" };
      const upd: Record<string, Json | undefined> = {};
      if (args.full_name !== undefined) upd.full_name = args.full_name;
      if (args.phone !== undefined) upd.phone = args.phone;
      const { error } = await db.rpc('restaurant_staff', { p_user: p.id, p_profile: upd, p_role: args.role ?? null });
      if (error) return { error: error.message };
      return { ok: true, staff: p.full_name };
    }

case "delete_staff": {
      const args = call.args;
      const p = await findProfile(db, args.match);
      if (!p) return { error: "Không tìm thấy nhân viên" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa nhân viên "${p.full_name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.auth.admin.deleteUser(p.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: p.full_name };
    }

    // ===== Attendance =====
    case "get_attendance_settings": {
      const { data, error } = await db.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
      if (error) return { error: error.message };
      return { settings: data };
    }

    case "update_attendance_settings": {
      const args = call.args;
      const upd: TablesUpdate<"attendance_settings"> = { updated_at: new Date().toISOString() };
      if (args.latitude !== undefined) upd.latitude = args.latitude;
      if (args.longitude !== undefined) upd.longitude = args.longitude;
      if (args.radius_m !== undefined) upd.radius_m = args.radius_m;
      const { data, error } = await db.from("attendance_settings").update(upd).eq("id", 1).select().single();
      if (error) return { error: error.message };
      return { ok: true, settings: data };
    }

    case "list_attendance": {
      const args = call.args;
      const { start, end } = periodRange(args.period ?? "today", args.from, args.to);
      let userId: string | null = null;
      if (args.staff) {
        const p = await findProfile(db, args.staff);
        if (!p) return { error: "Không tìm thấy nhân viên" };
        userId = p.id;
      }
      let q = db.from("attendance_logs")
        .select("user_id,kind,at,distance_m")
        .gte("at", start).lt("at", end)
        .order("at", { ascending: false }).limit(args.limit ?? 100);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const ids = [...new Set((data ?? []).map((l) => l.user_id))];
      const { data: profs } = await db.from("profiles").select("id,full_name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      return {
        from: start, to: end, count: data?.length ?? 0,
        logs: (data ?? []).map((l) => ({ ...l, staff: map.get(l.user_id) })),
      };
    }
  }
  return { error: "Unknown tool" };
}

// ============ MAIN ============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient<Database>(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await userClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow)
      return new Response(JSON.stringify({ error: "Chỉ admin được phép dùng AI assistant" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const messages = parseMessages(await req.json());

    const systemPrompt = `Bạn là trợ lý AI quản lý nhà hàng. Trả lời tiếng Việt, ngắn gọn, lịch sự.

QUAN TRỌNG: Bạn PHẢI gọi tool khi user hỏi về dữ liệu hoặc yêu cầu thao tác. KHÔNG được tự đoán hay trả lời từ bộ nhớ.
- Nếu total_revenue là null, giải thích hóa đơn cũ thiếu dữ liệu chốt; không tự ước tính tổng doanh thu.
- Hỏi doanh thu → gọi get_revenue hoặc list_bills. Khi trả lời dùng từ "hóa đơn" thay vì "đơn hàng".
- Hỏi bàn/khu vực → gọi list_tables_status hoặc list_areas
- Hỏi menu/danh mục → gọi list_menu
- Hỏi nguyên liệu/kho → gọi list_ingredients hoặc list_low_stock
- Hỏi nhân viên → gọi list_staff
- Hỏi chấm công → gọi list_attendance
- Hỏi cài đặt thanh toán, VAT, giảm giá → gọi get_payment_settings
- Thêm/sửa/xóa bất cứ thứ gì → gọi tool tương ứng

Các trường đặc biệt cần biết:
- menu_items có trường no_cook (true = không cần bếp, phục vụ ngay) và recipe (công thức/ghi chú chế biến)
- restaurant_tables có trường merged_group_id (khác null = đang được ghép bàn)
- orders có trường discount_percent (giảm giá riêng của bàn đó)
- payment_settings có trường global_discount_percent (giảm giá chung cho tất cả bàn)
- Doanh thu thực = subtotal × (1 + service%) × (1 + vat%) × (1 - discount%)

Các tool xóa (delete_area, delete_table, delete_category, delete_menu_item, delete_ingredient, delete_staff) LUÔN yêu cầu 2 bước: gọi tool lần đầu KHÔNG kèm confirmed, nếu kết quả trả về needs_confirmation=true thì PHẢI hiển thị nguyên văn message đó cho user và DỪNG lại chờ trả lời, KHÔNG được tự ý gọi lại tool ngay. Chỉ khi user xác nhận rõ ràng ở lượt sau (ví dụ: "có", "đồng ý", "xoá đi", "ok") mới gọi lại đúng tool đó với confirmed: true.
Với thao tác có hậu quả khác không phải xóa (đổi giá, đổi role, nhập/xuất kho lớn) → vẫn hỏi xác nhận bằng text trước khi gọi tool.
Format số tiền VN (1.250.000 đ). Dùng bảng/bullet markdown khi liệt kê.
Lưu ý từ ngữ: dùng "hóa đơn" (không dùng "đơn hàng"), "bàn" (không dùng "bàn ăn"), "nguyên liệu" (không dùng "vật liệu").`;

    const convo: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...messages];

    for (let i = 0; i < 10; i++) {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: convo,
          tools,
          tool_choice: "auto",
          temperature: 0,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.log("Gemini error:", resp.status, t);
        const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
        const msg = resp.status === 429
          ? "AI đang quá tải, vui lòng thử lại sau."
          : resp.status === 402
          ? "Hết quota Gemini API, vui lòng kiểm tra key."
          : "AI lỗi: " + t;
        return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await resp.json();
      const msg = parseAssistantResponse(data);
      if (!msg) return new Response(JSON.stringify({ error: "No response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      console.log("Gemini msg:", JSON.stringify({ content: msg.content, tool_calls_count: msg.tool_calls?.length ?? 0 }));
convo.push(msg);
const calls = msg.tool_calls;
      if (!calls || calls.length === 0) {
        const reply = (msg.content ?? "").trim();
        if (reply) {
          return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Gemini trả content rỗng sau tool call → yêu cầu tóm tắt lại
        convo.push({ role: "user", content: "Hãy tóm tắt kết quả tool vừa chạy cho tôi bằng tiếng Việt." });
        continue;
      }

      for (const c of calls) {
        let result;
        try { result = await runTool(invocation(c.function.name, JSON.parse(c.function.arguments)), userClient); }
        catch (error) {
          if (error instanceof TargetSelectionError) {
            // Stop this request: the model must not choose a candidate itself.
            return new Response(JSON.stringify({ reply: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          result = { error: error instanceof Error ? error.message : "Thao tác thất bại" };
        }
        convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }

    return new Response(JSON.stringify({ reply: "Quá nhiều bước, dừng lại." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
