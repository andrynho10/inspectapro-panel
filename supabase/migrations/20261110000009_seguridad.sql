-- =====================================================================
-- InspectaPro – Demo · 09 · Endurecimiento de seguridad
--  A) Límites anti-abuso (rate limiting) en escrituras de usuarios
--  B) Datos personales (RUT, ID interno, fecha de ingreso) visibles solo
--     para el propio usuario y para supervisores
--  C) Subida de fotos limitada por usuario y hora
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Rate limiting: cuenta las filas recientes del usuario conectado.
--    No aplica a tareas internas (cron/semilla), donde auth.uid() es NULL.
-- ---------------------------------------------------------------------
create or replace function private.tg_limite_por_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := tg_argv[0]::integer;
  v_n integer;
begin
  if v_uid is null then
    return new;
  end if;
  -- La marca de tiempo la pone el servidor: evita saltarse el límite con fechas falsas
  new := jsonb_populate_record(new, jsonb_build_object(coalesce(tg_argv[2], 'created_at'), now()));
  execute format(
    'select count(*) from %I.%I where %I = $1 and %I > now() - interval ''1 hour''',
    tg_table_schema, tg_table_name, tg_argv[1], coalesce(tg_argv[2], 'created_at'))
    into v_n using v_uid;
  if v_n >= v_max then
    raise exception 'Límite de seguridad: máximo % registros por hora en %', v_max, tg_table_name
      using errcode = 'P0429', hint = 'Espera un momento antes de volver a intentarlo.';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_limite_por_usuario() from public, anon, authenticated;

create trigger limite_reportes before insert on public.reportes_inspeccion
  for each row execute function private.tg_limite_por_usuario('30', 'usuario_id');
create trigger limite_asistente before insert on public.asistente_consultas
  for each row execute function private.tg_limite_por_usuario('30', 'usuario_id');
create trigger limite_historial before insert on public.historial_estados_activo
  for each row execute function private.tg_limite_por_usuario('30', 'usuario_cambio', 'fecha_cambio');

-- Respuestas: máximo 60 por reporte (un checklist tiene ~25) y fotos: máximo 5 por respuesta
create or replace function private.tg_limite_respuestas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return null; end if;
  if exists (
    select 1 from public.respuestas_reporte r
     where r.reporte_id in (select distinct reporte_id from nuevas)
     group by r.reporte_id having count(*) > 60
  ) then
    raise exception 'Límite de seguridad: demasiadas respuestas para un reporte' using errcode = 'P0429';
  end if;
  return null;
end;
$$;
revoke all on function private.tg_limite_respuestas() from public, anon, authenticated;
create trigger limite_respuestas after insert on public.respuestas_reporte
  referencing new table as nuevas for each statement execute function private.tg_limite_respuestas();

create or replace function private.tg_limite_fotos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return null; end if;
  if exists (
    select 1 from public.fotos_respuesta f
     where f.respuesta_id in (select distinct respuesta_id from nuevas)
     group by f.respuesta_id having count(*) > 5
  ) then
    raise exception 'Límite de seguridad: máximo 5 fotos por ítem' using errcode = 'P0429';
  end if;
  return null;
end;
$$;
revoke all on function private.tg_limite_fotos() from public, anon, authenticated;
create trigger limite_fotos after insert on public.fotos_respuesta
  referencing new table as nuevas for each statement execute function private.tg_limite_fotos();

-- ---------------------------------------------------------------------
-- B) Datos personales: la tabla real pasa a un esquema NO expuesto por la
--    API y en su lugar se publica una vista que enmascara RUT, ID interno y
--    fecha de ingreso para quien no sea el propio usuario o un supervisor.
--    Las apps siguen consultando "usuarios" igual que antes.
-- ---------------------------------------------------------------------
alter table public.usuarios set schema private;
alter table private.usuarios rename to usuarios_base;
grant select on private.usuarios_base to authenticated;   -- RLS sigue activo

-- es_supervisor() debe leer la tabla base (evita depender de la vista)
create or replace function private.es_supervisor()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.usuarios_base u
    where u.id = (select auth.uid()) and u.rol = 'SUPERVISOR'
  );
$$;

create view public.usuarios
with (security_invoker = true, security_barrier = true) as
select u.id,
       u.nombre_completo,
       u.rol,
       case when u.id = (select auth.uid()) or (select private.es_supervisor()) then u.rut end            as rut,
       case when u.id = (select auth.uid()) or (select private.es_supervisor()) then u.id_alternativo end as id_alternativo,
       u.centro_costo,
       case when u.id = (select auth.uid()) or (select private.es_supervisor()) then u.fecha_ingreso end  as fecha_ingreso,
       u.cargo,
       u.created_at
  from private.usuarios_base u;

revoke all on public.usuarios from anon;
grant select on public.usuarios to authenticated;

-- La carga de la demo escribe en la tabla base (la vista no es editable)
create or replace function demo.cargar_catalogo()
returns void language plpgsql set search_path = public, extensions as $$
begin
  insert into private.usuarios_base (id, nombre_completo, rol, rut, id_alternativo, centro_costo, fecha_ingreso, cargo)
  select au.id, p.nombre_completo, p.rol, p.rut, p.id_alternativo, p.centro_costo, p.fecha_ingreso, p.cargo
    from demo.perfiles p join auth.users au on lower(au.email) = p.email
  on conflict (id) do update set nombre_completo = excluded.nombre_completo, rol = excluded.rol,
     rut = excluded.rut, id_alternativo = excluded.id_alternativo, centro_costo = excluded.centro_costo,
     fecha_ingreso = excluded.fecha_ingreso, cargo = excluded.cargo;

  insert into activos (id, nombre, modelo, tipo, codigo_qr, es_operativa, es_standby, horometro_actual, created_at) values
   (1, 'GH-01', 'Toyota 8FGU25 (GLP, 2.5 t)',     'Grúa Horquilla', 'IP-GH-001', true,  false, 6120.0, now() - interval '200 days'),
   (2, 'GH-02', 'Hyster H50FT (GLP, 2.5 t)',      'Grúa Horquilla', 'IP-GH-002', true,  false, 4385.5, now() - interval '200 days'),
   (3, 'GH-03', 'Yale GLP050VX (GLP, 2.3 t)',     'Grúa Horquilla', 'IP-GH-003', true,  false, 9830.0, now() - interval '200 days'),
   (4, 'GH-04', 'Linde H25D (diésel, 2.5 t)',     'Grúa Horquilla', 'IP-GH-004', true,  false, 3270.0, now() - interval '200 days'),
   (5, 'GH-05', 'Komatsu FG25T-16 (GLP, 2.5 t)',  'Grúa Horquilla', 'IP-GH-005', true,  false, 7455.0, now() - interval '200 days'),
   (6, 'GH-06', 'Caterpillar GP25N (GLP, 2.5 t)', 'Grúa Horquilla', 'IP-GH-006', false, false, 8010.0, now() - interval '200 days'),
   (7, 'GH-07', 'Toyota 8FBE18 (eléctrica, 1.8 t)','Grúa Horquilla','IP-GH-007', true,  false, 2140.0, now() - interval '200 days'),
   (8, 'GH-08', 'Hyster J1.6XN (eléctrica, 1.6 t)','Grúa Horquilla','IP-GH-008', true,  true,  1580.0, now() - interval '200 days');
  perform setval(pg_get_serial_sequence('public.activos', 'id'), 8);

  insert into plantillas_checklist (id, nombre, tipo_activo, activa) values
   (1, 'Checklist diario pre-uso – Grúa Horquilla', 'Grúa Horquilla', true);
  perform setval(pg_get_serial_sequence('public.plantillas_checklist', 'id'), 1);

  insert into categorias_plantilla (id, plantilla_id, nombre, orden) values
   (1, 1, 'Inspección visual', 1), (2, 1, 'Niveles y fluidos', 2), (3, 1, 'Sistema hidráulico y mástil', 3),
   (4, 1, 'Frenos y dirección', 4), (5, 1, 'Elementos de seguridad', 5), (6, 1, 'Neumáticos y ruedas', 6);
  perform setval(pg_get_serial_sequence('public.categorias_plantilla', 'id'), 6);

  insert into preguntas_plantilla (id, categoria_id, texto, orden) values
   (1, 1, 'Estructura y chasis sin golpes ni fisuras', 1),
   (2, 1, 'Protector de techo (cabina) en buen estado', 2),
   (3, 1, 'Horquillas sin deformaciones ni desgaste excesivo', 3),
   (4, 1, 'Placa de capacidad de carga legible', 4),
   (5, 2, 'Nivel de aceite de motor correcto', 1),
   (6, 2, 'Nivel de refrigerante correcto', 2),
   (7, 2, 'Nivel de aceite hidráulico correcto', 3),
   (8, 2, 'Sin fugas de combustible / GLP (cilindro bien fijado)', 4),
   (9, 3, 'Sin fugas de aceite hidráulico en mangueras y cilindros', 1),
   (10, 3, 'Cadenas del mástil lubricadas y sin eslabones dañados', 2),
   (11, 3, 'Elevación y descenso suaves, sin ruidos anormales', 3),
   (12, 3, 'Inclinación del mástil funciona correctamente', 4),
   (13, 4, 'Freno de servicio responde correctamente', 1),
   (14, 4, 'Freno de estacionamiento sostiene la grúa', 2),
   (15, 4, 'Dirección sin juego excesivo', 3),
   (16, 4, 'Pedal de acercamiento (inching) funciona', 4),
   (17, 5, 'Bocina funciona', 1),
   (18, 5, 'Alarma de retroceso funciona', 2),
   (19, 5, 'Luces delanteras, traseras y baliza funcionan', 3),
   (20, 5, 'Cinturón de seguridad en buen estado', 4),
   (21, 5, 'Extintor presente, cargado y con sello', 5),
   (22, 5, 'Espejos retrovisores en buen estado', 6),
   (23, 6, 'Neumáticos sin cortes ni desgaste excesivo', 1),
   (24, 6, 'Pernos de ruedas completos y apretados', 2),
   (25, 6, 'Presión / estado de bandas de rodado adecuados', 3);
  perform setval(pg_get_serial_sequence('public.preguntas_plantilla', 'id'), 25);

  insert into email_destinatarios (id, email, nombre, activo, tipo) values
   (1, 'supervisor.demo@example.com', 'Paula Herrera Castillo', true, 'supervisor'),
   (2, 'mantencion@example.com',      'Equipo de Mantención',   true, 'mantencion');
  perform setval(pg_get_serial_sequence('public.email_destinatarios', 'id'), 2);

  insert into email_destinatarios_activos (email_destinatario_id, activo_id)
  select 1, id from activos union all select 2, id from activos where id in (3, 5, 6);

  insert into supervisores_activos (usuario_id, activo_id)
  select u.id, a.id from usuarios u cross join activos a where u.rol = 'SUPERVISOR';
end;
$$;
revoke all on function demo.cargar_catalogo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- C) Storage: además de exigir un reporte propio, máximo 40 fotos por hora
-- ---------------------------------------------------------------------
-- Cuenta con privilegios elevados (el usuario no puede listar storage.objects)
create or replace function private.fotos_subidas_ultima_hora()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'fotos-reportes'
     and o.owner_id = (select auth.uid())::text
     and o.created_at > now() - interval '1 hour';
$$;
revoke all on function private.fotos_subidas_ultima_hora() from public, anon;
grant execute on function private.fotos_subidas_ultima_hora() to authenticated;

drop policy if exists fotos_upload on storage.objects;
create policy fotos_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-reportes'
    and (storage.foldername(name))[1] = 'reportes'
    and exists (select 1 from public.reportes_inspeccion r
                 where r.id::text = (storage.foldername(name))[2]
                   and r.usuario_id = (select auth.uid()))
    and (select private.fotos_subidas_ultima_hora()) < 40
  );

-- usuarios ahora es una vista: se agrupa por todas sus columnas
create or replace function public.obtener_analisis_operadores(dias integer default 90)
returns table (usuario_id uuid, nombre_completo text, rut text, id_alternativo text, centro_costo text,
               fecha_ingreso date, cargo text, total_inspecciones integer, inspecciones_con_problemas integer,
               porcentaje_problemas numeric, score_promedio numeric, duracion_promedio_minutos numeric,
               duracion_ultima_inspeccion integer, ultima_inspeccion timestamptz, dias_desde_ultima integer)
language sql stable set search_path = public as $$
  select u.id, u.nombre_completo, u.rut, u.id_alternativo, u.centro_costo, u.fecha_ingreso, u.cargo,
         count(r.id)::int, count(r.id) filter (where r.tiene_problemas)::int,
         round(100.0 * count(r.id) filter (where r.tiene_problemas) / nullif(count(r.id), 0), 1),
         round(avg(r.score_cumplimiento)::numeric, 1),
         round(avg(r.duracion_minutos)::numeric, 1),
         (array_agg(r.duracion_minutos order by r.timestamp_completado desc))[1],
         max(r.timestamp_completado),
         extract(day from now() - max(r.timestamp_completado))::int
    from usuarios u
    join reportes_inspeccion r on r.usuario_id = u.id
   where u.rol = 'OPERADOR'
     and r.timestamp_completado >= now() - make_interval(days => dias)
   group by u.id, u.nombre_completo, u.rut, u.id_alternativo, u.centro_costo, u.fecha_ingreso, u.cargo
   order by u.nombre_completo;
$$;
