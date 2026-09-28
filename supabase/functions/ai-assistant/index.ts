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

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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
];

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

async function findRow(table: string, match: string, fields = "*") {
  const byId = await admin.from(table).select(fields).eq("id", match).maybeSingle();
  if (byId.data) return byId.data as any;
  const all = await admin.from(table).select(fields);
  const q = norm(match);
  return ((all.data ?? []) as any[]).find((x: any) => norm(x.name).includes(q));
}

async function findProfile(match: string) {
  const byId = await admin.from("profiles").select("*").eq("id", match).maybeSingle();
  if (byId.data) return byId.data;
  const all = await admin.from("profiles").select("*");
  const q = norm(match);
  return (all.data ?? []).find((p: any) =>
    norm(p.full_name || "").includes(q) || norm(p.username || "").includes(q)
  );
}

async function getCategoryId(category: string): Promise<string | null> {
  const byId = await admin.from("categories").select("id").eq("id", category).maybeSingle();
  if (byId.data) return byId.data.id;
  const byName = await admin.from("categories").select("id").ilike("name", category).maybeSingle();
  if (byName.data) return byName.data.id;
  const { data: max } = await admin.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const ins = await admin.from("categories").insert({ name: category, sort_order: (max?.sort_order ?? 0) + 1 }).select("id").single();
  return ins.data?.id ?? null;
}

// Tính doanh thu thực giống AdminDashboard.tsx: VAT + service + discount
async function calcFinalRevenue(orders: any[]): Promise<number> {
  const { data: ps } = await admin.from("payment_settings")
    .select("vat_percent, service_percent, global_discount_percent")
    .eq("id", 1).maybeSingle();
  const vatPct = ps?.vat_percent ?? 0;
  const svcPct = ps?.service_percent ?? 0;
  const globalDiscPct = ps?.global_discount_percent ?? 0;

  return orders.reduce((sum, o) => {
    const subtotal = Number(o.total ?? 0);
    const afterSvc = subtotal + Math.round(subtotal * svcPct / 100);
    const afterVat = afterSvc + Math.round(afterSvc * vatPct / 100);
    const effectivePct = Number(o.discount_percent ?? 0) > 0 ? Number(o.discount_percent) : globalDiscPct;
    return sum + afterVat - Math.round(afterVat * effectivePct / 100);
  }, 0);
}

// ============ TOOL HANDLERS ============
async function runTool(name: string, args: any): Promise<any> {
  switch (name) {

    // ===== Analytics =====
    case "get_revenue": {
      const { start, end } = periodRange(args.period, args.from, args.to);
      // FIX: lấy thêm discount_percent để tính đúng như Dashboard
      const { data, error } = await admin.from("orders")
        .select("total, paid_at, discount_percent")
        .eq("is_paid", true)
        .gte("paid_at", start).lt("paid_at", end);
      if (error) return { error: error.message };
      const paidOrders = data ?? [];
      const total_revenue = await calcFinalRevenue(paidOrders);
      return { period: args.period, from: start, to: end, order_count: paidOrders.length, total_revenue };
    }

    case "top_selling_items": {
      const days = args.days ?? 7;
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await admin.from("order_items")
        .select("name_snapshot,quantity,created_at").gte("created_at", since);
      if (error) return { error: error.message };
      const map = new Map<string, number>();
      for (const it of (data ?? [])) map.set(it.name_snapshot, (map.get(it.name_snapshot) ?? 0) + Number(it.quantity));
      const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.limit ?? 10);
      return { days, top: sorted.map(([name, qty]) => ({ name, qty })) };
    }

    case "list_bills": {
      const { start, end } = periodRange(args.period ?? "today", args.from, args.to);
      const { data, error } = await admin.from("orders")
        .select("id,total,paid_at,payment_method,table_id,discount_percent")
        .eq("is_paid", true).gte("paid_at", start).lt("paid_at", end)
        .order("paid_at", { ascending: false }).limit(args.limit ?? 50);
      if (error) return { error: error.message };
      return { from: start, to: end, count: data?.length ?? 0, bills: data };
    }

    // ===== Tables / Areas =====
    case "list_tables_status": {
      // FIX: thêm merged_group_id để biết bàn nào đang ghép
      const { data, error } = await admin.from("restaurant_tables")
        .select("name,status,seats,area_id,merged_group_id,sort_order")
        .order("sort_order");
      if (error) return { error: error.message };
      return { tables: data };
    }

    case "list_areas": {
      const { data, error } = await admin.from("areas").select("id,name,sort_order").order("sort_order");
      if (error) return { error: error.message };
      return { areas: data };
    }

    case "add_area": {
      const { data: max } = await admin.from("areas").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("areas").insert({ name: args.name, sort_order: (max?.sort_order ?? 0) + 1 }).select().single();
      if (error) return { error: error.message };
      return { ok: true, area: data };
    }

    case "update_area": {
      const a = await findRow("areas", args.match);
      if (!a) return { error: "Không tìm thấy khu vực" };
      const { data, error } = await admin.from("areas").update({ name: args.new_name }).eq("id", a.id).select().single();
      if (error) return { error: error.message };
      return { ok: true, area: data };
    }

   case "delete_area": {
      const a = await findRow("areas", args.match);
      if (!a) return { error: "Không tìm thấy khu vực" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa khu vực "${a.name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.from("areas").delete().eq("id", a.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: a.name };
    }

    case "add_table": {
      let area_id: string | null = null;
      if (args.area) { const a = await findRow("areas", args.area); area_id = a?.id ?? null; }
      const { data: max } = await admin.from("restaurant_tables").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("restaurant_tables")
        .insert({ name: args.name, area_id, seats: args.seats ?? 4, sort_order: (max?.sort_order ?? 0) + 1 })
        .select().single();
      if (error) return { error: error.message };
      return { ok: true, table: data };
    }

    case "update_table": {
      const t = await findRow("restaurant_tables", args.match);
      if (!t) return { error: "Không tìm thấy bàn" };
      const upd: any = {};
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.seats !== undefined) upd.seats = args.seats;
      if (args.status !== undefined) upd.status = args.status;
      const { data, error } = await admin.from("restaurant_tables").update(upd).eq("id", t.id).select().single();
      if (error) return { error: error.message };
      return { ok: true, table: data };
    }

 case "delete_table": {
      const t = await findRow("restaurant_tables", args.match);
      if (!t) return { error: "Không tìm thấy bàn" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa bàn "${t.name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.from("restaurant_tables").delete().eq("id", t.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: t.name };
    }

    // ===== Menu =====
    case "list_menu": {
      // FIX: thêm no_cook, recipe vào select
      const { data, error } = await admin.from("menu_items")
        .select("id,name,price,is_available,category_id,no_cook,recipe").order("name");
      if (error) return { error: error.message };
      const s = norm(args.search || "");
      const items = s ? (data ?? []).filter((x: any) => norm(x.name).includes(s)) : data;
      return { items };
    }

    case "list_categories": {
      const { data, error } = await admin.from("categories").select("id,name,sort_order").order("sort_order");
      if (error) return { error: error.message };
      return { categories: data };
    }

    case "add_category": {
      const { data: existing } = await admin.from("categories").select("*").ilike("name", args.name).maybeSingle();
      if (existing) return { ok: true, note: "Đã tồn tại", category: existing };
      const { data: max } = await admin.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("categories").insert({ name: args.name, sort_order: (max?.sort_order ?? 0) + 1 }).select().single();
      if (error) return { error: error.message };
      return { ok: true, category: data };
    }
case "delete_category": {
      const c = await findRow("categories", args.match);
      if (!c) return { error: "Không tìm thấy danh mục" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa danh mục "${c.name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.from("categories").delete().eq("id", c.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: c.name };
    }

    case "add_menu_item": {
      const category_id = args.category ? await getCategoryId(args.category) : null;
      // FIX: thêm no_cook và recipe
      const { data, error } = await admin.from("menu_items").insert({
        name: args.name, price: args.price, category_id,
        is_available: args.is_available ?? true,
        no_cook: args.no_cook ?? false,
        recipe: args.recipe ?? null,
      }).select().single();
      if (error) return { error: error.message };
      return { ok: true, item: data };
    }

    case "update_menu_item": {
      const item = await findRow("menu_items", args.match);
      if (!item) return { error: `Không tìm thấy món "${args.match}"` };
      const upd: any = {};
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.new_price !== undefined) upd.price = args.new_price;
      if (args.is_available !== undefined) upd.is_available = args.is_available;
      // FIX: thêm no_cook và recipe
      if (args.no_cook !== undefined) upd.no_cook = args.no_cook;
      if (args.recipe !== undefined) upd.recipe = args.recipe;
      if (Object.keys(upd).length === 0) return { error: "Không có gì để sửa" };
      const { data, error } = await admin.from("menu_items").update(upd).eq("id", item.id).select().single();
      if (error) return { error: error.message };
      return { ok: true, item: data };
    }

case "delete_menu_item": {
      const item = await findRow("menu_items", args.match);
      if (!item) return { error: `Không tìm thấy món "${args.match}"` };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa món "${item.name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.from("menu_items").delete().eq("id", item.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: item.name };
    }

    // ===== Ingredients =====
    case "list_ingredients": {
      const { data, error } = await admin.from("ingredients").select("id,name,unit,stock,min_stock").order("name");
      if (error) return { error: error.message };
      const s = norm(args.search || "");
      const items = s ? (data ?? []).filter((x: any) => norm(x.name).includes(s)) : data;
      return { ingredients: items };
    }

    case "list_low_stock": {
      const { data, error } = await admin.from("ingredients").select("name,unit,stock,min_stock");
      if (error) return { error: error.message };
      // FIX: dùng < thay vì <= để khớp với Dashboard và MenuAndInventory
      return { low_stock: (data ?? []).filter((x: any) => Number(x.stock) < Number(x.min_stock)) };
    }

    case "add_ingredient": {
      const { data, error } = await admin.from("ingredients")
        .insert({ name: args.name, unit: args.unit ?? "g", stock: args.stock ?? 0, min_stock: args.min_stock ?? 0 })
        .select().single();
      if (error) return { error: error.message };
      return { ok: true, ingredient: data };
    }

    case "update_ingredient": {
      const ing = await findRow("ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      const upd: any = {};
      if (args.new_name !== undefined) upd.name = args.new_name;
      if (args.unit !== undefined) upd.unit = args.unit;
      if (args.min_stock !== undefined) upd.min_stock = args.min_stock;
      if (args.set_stock !== undefined) upd.stock = args.set_stock;
      const { data, error } = await admin.from("ingredients").update(upd).eq("id", ing.id).select().single();
      if (error) return { error: error.message };
      return { ok: true, ingredient: data };
    }

    case "adjust_stock": {
      const ing = await findRow("ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      const newStock = Math.max(0, Number(ing.stock) + Number(args.delta));
      const { error: e1 } = await admin.from("ingredients").update({ stock: newStock }).eq("id", ing.id);
      if (e1) return { error: e1.message };
      await admin.from("stock_movements").insert({ ingredient_id: ing.id, delta: args.delta, reason: args.reason ?? "AI assistant" });
      return { ok: true, ingredient: ing.name, new_stock: newStock };
    }
case "delete_ingredient": {
      const ing = await findRow("ingredients", args.match);
      if (!ing) return { error: "Không tìm thấy nguyên liệu" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa nguyên liệu "${ing.name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.from("ingredients").delete().eq("id", ing.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: ing.name };
    }

    case "set_recipe": {
      const item = await findRow("menu_items", args.menu_item);
      if (!item) return { error: "Không tìm thấy món" };
      await admin.from("recipes").delete().eq("menu_item_id", item.id);
      const rows: any[] = [];
      for (const r of (args.items ?? [])) {
        const ing = await findRow("ingredients", r.ingredient);
        if (!ing) return { error: `Không tìm thấy nguyên liệu: ${r.ingredient}` };
        rows.push({ menu_item_id: item.id, ingredient_id: ing.id, quantity: r.quantity });
      }
      if (rows.length) { const { error } = await admin.from("recipes").insert(rows); if (error) return { error: error.message }; }
      return { ok: true, menu_item: item.name, count: rows.length };
    }

    case "get_recipe": {
      const item = await findRow("menu_items", args.menu_item);
      if (!item) return { error: "Không tìm thấy món" };
      const { data: rec } = await admin.from("recipes").select("ingredient_id,quantity").eq("menu_item_id", item.id);
      const ingIds = (rec ?? []).map((r: any) => r.ingredient_id);
      const { data: ings } = await admin.from("ingredients").select("id,name,unit")
        .in("id", ingIds.length ? ingIds : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((ings ?? []).map((i: any) => [i.id, i]));
      return {
        menu_item: item.name,
        recipe: (rec ?? []).map((r: any) => ({
          ingredient: (map.get(r.ingredient_id) as any)?.name,
          unit: (map.get(r.ingredient_id) as any)?.unit,
          quantity: r.quantity,
        })),
      };
    }

    // ===== Payment settings =====
    case "get_payment_settings": {
      const { data, error } = await admin.from("payment_settings").select("*").eq("id", 1).maybeSingle();
      if (error) return { error: error.message };
      return { settings: data };
    }

    case "update_payment_settings": {
      // FIX: thêm global_discount_percent
      const fields = [
        "shop_name", "address", "phone", "tax_code", "slogan",
        "bank_name", "account_holder", "account_number",
        "vat_percent", "service_percent", "global_discount_percent",
        "footer_note", "policy_note",
      ];
      const upd: any = { id: 1, updated_at: new Date().toISOString() };
      for (const f of fields) if (args[f] !== undefined) upd[f] = args[f];
      const { data, error } = await admin.from("payment_settings").upsert(upd).select().single();
      if (error) return { error: error.message };
      return { ok: true, settings: data };
    }

    // ===== Staff =====
    case "list_staff": {
      const { data: profiles } = await admin.from("profiles").select("id,username,full_name,phone");
      const { data: roles } = await admin.from("user_roles").select("user_id,role");
      const map = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      return { staff: (profiles ?? []).map((p: any) => ({ ...p, role: map.get(p.id) ?? null })) };
    }

    case "create_staff": {
      const { data: created, error: e1 } = await admin.auth.admin.createUser({
        email: args.email, password: args.password, email_confirm: true,
        user_metadata: { full_name: args.full_name ?? args.username ?? args.email },
      });
      if (e1) return { error: e1.message };
      const uid = created.user!.id;
      await admin.from("profiles").upsert({
        id: uid, username: args.username ?? args.email.split("@")[0],
        full_name: args.full_name ?? args.username ?? args.email,
        phone: args.phone ?? null, visible_password: args.password,
      });
      await admin.from("user_roles").upsert({ user_id: uid, role: args.role });
      return { ok: true, user_id: uid, email: args.email, role: args.role };
    }

    case "update_staff": {
      const p = await findProfile(args.match);
      if (!p) return { error: "Không tìm thấy nhân viên" };
      const upd: any = {};
      if (args.full_name !== undefined) upd.full_name = args.full_name;
      if (args.phone !== undefined) upd.phone = args.phone;
      if (Object.keys(upd).length) await admin.from("profiles").update(upd).eq("id", p.id);
      if (args.role !== undefined) {
        await admin.from("user_roles").delete().eq("user_id", p.id);
        await admin.from("user_roles").insert({ user_id: p.id, role: args.role });
      }
      return { ok: true, staff: p.full_name };
    }

case "delete_staff": {
      const p = await findProfile(args.match);
      if (!p) return { error: "Không tìm thấy nhân viên" };
      if (!args.confirmed) return { needs_confirmation: true, message: `Bạn có chắc muốn xóa nhân viên "${p.full_name}"? Xác nhận để tiếp tục.` };
      const { error } = await admin.auth.admin.deleteUser(p.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: p.full_name };
    }

    // ===== Attendance =====
    case "get_attendance_settings": {
      const { data, error } = await admin.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
      if (error) return { error: error.message };
      return { settings: data };
    }

    case "update_attendance_settings": {
      const upd: any = { id: 1, updated_at: new Date().toISOString() };
      if (args.latitude !== undefined) upd.latitude = args.latitude;
      if (args.longitude !== undefined) upd.longitude = args.longitude;
      if (args.radius_m !== undefined) upd.radius_m = args.radius_m;
      const { data, error } = await admin.from("attendance_settings").upsert(upd).select().single();
      if (error) return { error: error.message };
      return { ok: true, settings: data };
    }

    case "list_attendance": {
      const { start, end } = periodRange(args.period ?? "today", args.from, args.to);
      let userId: string | null = null;
      if (args.staff) {
        const p = await findProfile(args.staff);
        if (!p) return { error: "Không tìm thấy nhân viên" };
        userId = p.id;
      }
      let q = admin.from("attendance_logs")
        .select("user_id,kind,at,distance_m")
        .gte("at", start).lt("at", end)
        .order("at", { ascending: false }).limit(args.limit ?? 100);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const ids = [...new Set((data ?? []).map((l: any) => l.user_id))];
      const { data: profs } = await admin.from("profiles").select("id,full_name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return {
        from: start, to: end, count: data?.length ?? 0,
        logs: (data ?? []).map((l: any) => ({ ...l, staff: map.get(l.user_id) })),
      };
    }
  }
  return { error: "Unknown tool: " + name };
}

// ============ MAIN ============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow)
      return new Response(JSON.stringify({ error: "Chỉ admin được phép dùng AI assistant" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages } = await req.json();

    const systemPrompt = `Bạn là trợ lý AI quản lý nhà hàng. Trả lời tiếng Việt, ngắn gọn, lịch sự.

QUAN TRỌNG: Bạn PHẢI gọi tool khi user hỏi về dữ liệu hoặc yêu cầu thao tác. KHÔNG được tự đoán hay trả lời từ bộ nhớ.
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

    const convo: any[] = [{ role: "system", content: systemPrompt }, ...messages];

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
      const msg = data.choices?.[0]?.message;
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
        let a: any = {};
        try { a = JSON.parse(c.function.arguments || "{}"); } catch {}
        const result = await runTool(c.function.name, a);
        convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }

    return new Response(JSON.stringify({ reply: "Quá nhiều bước, dừng lại." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
