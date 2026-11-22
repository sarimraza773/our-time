begin;
-- November 21 is already applied. Extend its constraints without replaying it.
alter table public.calendar_events drop constraint calendar_events_color_check,
  add constraint calendar_events_color_check check (color in ('blush','rose','peony','mauve','shell','berry') or color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.recurring_rules drop constraint recurring_rules_color_check,
  add constraint recurring_rules_color_check check (color in ('blush','rose','peony','mauve','shell','berry') or color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.recurring_exceptions drop constraint recurring_exceptions_color_check,
  add constraint recurring_exceptions_color_check check (replacement_event->>'color' in ('blush','rose','peony','mauve','shell','berry') or replacement_event->>'color' ~ '^#[0-9A-Fa-f]{6}$');
commit;
