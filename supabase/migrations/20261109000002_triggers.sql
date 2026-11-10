-- =====================================================================
-- InspectaPro – Demo · 02 · Esquema privado, helpers y triggers
-- El esquema "private" NO está expuesto por la API REST.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ¿El usuario conectado es supervisor? (SECURITY DEFINER para evitar recursión de RLS en usuarios)
create or replace function private.es_supervisor()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'SUPERVISOR'
  );
$$;
revoke all on function private.es_supervisor() from public, anon;
grant execute on function private.es_supervisor() to authenticated;

-- Turno según hora local de Chile: 1 = 07–15, 2 = 15–23, 3 = 23–07
create or replace function private.calcular_turno(ts timestamptz)
returns smallint
language sql stable
set search_path = ''
as $$
  select case
    when extract(hour from ts at time zone 'America/Santiago') >= 7
     and extract(hour from ts at time zone 'America/Santiago') < 15 then 1
    when extract(hour from ts at time zone 'America/Santiago') >= 15
     and extract(hour from ts at time zone 'America/Santiago') < 23 then 2
    else 3 end::smallint;
$$;

-- BEFORE INSERT/UPDATE en reportes: turno, horas de uso y estado de horómetro
create or replace function private.tg_reporte_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.turno is null then
    new.turno := private.calcular_turno(coalesce(new.timestamp_inicio, new.timestamp_completado));
  end if;
  if new.horometro_final is not null and new.horometro_inicial is not null then
    new.horas_uso := round((new.horometro_final - new.horometro_inicial)::numeric, 1);
    new.horometro_pendiente := false;
  elsif new.horometro_inicial is not null and new.horometro_final is null then
    new.horometro_pendiente := true;
  end if;
  return new;
end;
$$;

create trigger reporte_before
before insert or update on public.reportes_inspeccion
for each row execute function private.tg_reporte_before();

-- AFTER: mantiene activos.horometro_actual con el mayor valor conocido
create or replace function private.tg_reporte_horometro_activo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v real := greatest(coalesce(new.horometro_final, 0), coalesce(new.horometro_inicial, 0));
begin
  if v > 0 then
    update public.activos
       set horometro_actual = greatest(coalesce(horometro_actual, 0), v)
     where id = new.activo_id
       and coalesce(horometro_actual, 0) < v;
  end if;
  return null;
end;
$$;

create trigger reporte_horometro_activo
after insert or update of horometro_inicial, horometro_final on public.reportes_inspeccion
for each row execute function private.tg_reporte_horometro_activo();

-- AFTER INSERT (por sentencia) en respuestas: recalcula métricas del reporte
-- y registra la notificación simulada si hay fallas.
create or replace function private.tg_respuestas_metricas()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.reportes_inspeccion r
     set total_respuestas   = s.total,
         respuestas_malas   = s.malas,
         tiene_problemas    = s.malas > 0,
         score_cumplimiento = case when s.total = 0 then 100
                                   else round(100.0 * (s.total - s.malas) / s.total, 1) end
    from (
      select rr.reporte_id,
             count(*)::int                           as total,
             count(*) filter (where not rr.respuesta)::int as malas
        from public.respuestas_reporte rr
       where rr.reporte_id in (select distinct reporte_id from nuevas)
       group by rr.reporte_id
    ) s
   where r.id = s.reporte_id;

  -- Notificación simulada (en el sistema original: Edge Function + Resend + FCM)
  if coalesce(current_setting('demo.sin_notificaciones', true), '') <> 'on' then
    insert into public.notificaciones_simuladas (reporte_id, canal, destinatario, asunto, detalle)
    select r.id, d.canal, d.destinatario,
           format('Inspección con %s falla(s) – %s', r.respuestas_malas, a.nombre),
           jsonb_build_object('activo', a.nombre, 'score', r.score_cumplimiento,
                              'modo', 'SIMULADO: no se envió ningún correo ni push')
      from public.reportes_inspeccion r
      join public.activos a on a.id = r.activo_id
      cross join lateral (
        select 'EMAIL'::text as canal, ed.email as destinatario
          from public.email_destinatarios ed
          join public.email_destinatarios_activos eda on eda.email_destinatario_id = ed.id
         where eda.activo_id = r.activo_id and ed.activo
        union all
        select 'PUSH', u.nombre_completo
          from public.supervisores_activos sa
          join public.usuarios u on u.id = sa.usuario_id
         where sa.activo_id = r.activo_id
      ) d
     where r.id in (select distinct reporte_id from nuevas)
       and r.tiene_problemas
       and not exists (select 1 from public.notificaciones_simuladas n where n.reporte_id = r.id);
  end if;
  return null;
end;
$$;

create trigger respuestas_metricas
after insert on public.respuestas_reporte
referencing new table as nuevas
for each statement execute function private.tg_respuestas_metricas();

-- Funciones de trigger: nadie las llama por API
revoke all on function private.tg_reporte_before() from public, anon, authenticated;
revoke all on function private.tg_reporte_horometro_activo() from public, anon, authenticated;
revoke all on function private.tg_respuestas_metricas() from public, anon, authenticated;
