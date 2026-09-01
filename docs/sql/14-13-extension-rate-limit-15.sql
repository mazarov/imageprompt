-- Shared Extension Lite / site analyze+remix daily cap: 30 → 15 per identity
-- (authenticated `user:{id}`, otherwise salted IP) in the current UTC day.
-- Landing reads `aiid_app_config.extension_rate_limit_per_day` (cache ~2 min).

insert into public.aiid_app_config (key, value)
values ('extension_rate_limit_per_day', '15')
on conflict (key) do update
set value = excluded.value;
