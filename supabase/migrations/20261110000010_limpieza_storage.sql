-- =====================================================================
-- InspectaPro – Demo · 10 · Limpieza nocturna de fotos de visitantes
-- pg_cron llama (vía pg_net) a la Edge Function "mantenimiento-demo".
-- El secreto compartido se guarda en Supabase Vault (nunca en el repo):
--   select vault.create_secret('<valor>', 'cron_secret');
-- y el mismo valor como secreto CRON_SECRET de la Edge Function.
-- =====================================================================
create extension if not exists pg_net with schema extensions;

create or replace function demo.limpiar_fotos_visitantes()
returns bigint language sql set search_path = '' as $$
  select net.http_post(
    url     := (select valor from demo.config where clave = 'supabase_url') || '/functions/v1/mantenimiento-demo',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb
  );
$$;
revoke all on function demo.limpiar_fotos_visitantes() from public, anon, authenticated;

-- 5 minutos después del reseteo nocturno
select cron.schedule('demo-limpieza-fotos', '5 7 * * *', $$select demo.limpiar_fotos_visitantes()$$);
