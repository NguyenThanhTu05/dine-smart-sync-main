
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS shop_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS tax_code text,
  ADD COLUMN IF NOT EXISTS slogan text,
  ADD COLUMN IF NOT EXISTS footer_note text DEFAULT 'Cảm ơn quý khách và hẹn gặp lại!',
  ADD COLUMN IF NOT EXISTS vat_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_qr_url text,
  ADD COLUMN IF NOT EXISTS policy_note text;
