-- Phase 1 uses staff wa.me Remind only; drop Meta WhatsApp tracking if present
alter table public.membership_billing
  drop column if exists reminder_sent_at;
