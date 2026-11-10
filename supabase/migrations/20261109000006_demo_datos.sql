-- =====================================================================
-- InspectaPro – Demo · 06 · Datos ficticios, reseteo nocturno y simulación
-- Todo vive en el esquema "demo", que NO se expone por la API.
-- Requiere que los usuarios existan en auth.users (se crean con la API Admin).
-- =====================================================================

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

-- Contraseña pública de las cuentas demo (se restablece cada noche)
create table demo.config (clave text primary key, valor text not null);
insert into demo.config values ('password_demo', 'Demo1234!');
revoke all on demo.config from public, anon, authenticated;

-- Perfiles ficticios (RUT con dígito verificador válido, personas inventadas)
create table demo.perfiles (
  email text primary key, nombre_completo text not null, rol text not null, rut text,
  id_alternativo text, centro_costo text, fecha_ingreso date, cargo text, es_cuenta_publica boolean default false
);
insert into demo.perfiles values
 ('operador.demo@example.com',   'Diego Fuentes Araya',     'OPERADOR',   '16.482.731-5', 'OP-101', 'Bodega Central',      '2021-03-15', 'Operador de grúa horquilla', true),
 ('camila.rojas@example.com',    'Camila Rojas Pizarro',    'OPERADOR',   '17.905.214-3', 'OP-102', 'Bodega Central',      '2022-07-01', 'Operadora de grúa horquilla', false),
 ('matias.gonzalez@example.com', 'Matías González Vera',    'OPERADOR',   '15.338.692-K', 'OP-103', 'Andén de Despacho',   '2019-11-04', 'Operador de grúa horquilla', false),
 ('javiera.munoz@example.com',   'Javiera Muñoz Tapia',     'OPERADOR',   '18.271.540-8', 'OP-104', 'Andén de Despacho',   '2023-02-20', 'Operadora de grúa horquilla', false),
 ('sebastian.diaz@example.com',  'Sebastián Díaz Morales',  'OPERADOR',   '16.954.087-2', 'OP-105', 'Patio de Contenedores','2020-05-11', 'Operador de grúa horquilla', false),
 ('felipe.contreras@example.com','Felipe Contreras Lagos',  'OPERADOR',   '19.120.366-4', 'OP-106', 'Patio de Contenedores','2024-01-08', 'Operador de grúa horquilla (turno noche)', false),
 ('supervisor.demo@example.com', 'Paula Herrera Castillo',  'SUPERVISOR', '13.804.552-1', 'SP-201', 'Operaciones',         '2017-09-01', 'Supervisora de operaciones', true),
 ('rodrigo.soto@example.com',    'Rodrigo Soto Navarro',    'SUPERVISOR', '12.667.913-6', 'SP-202', 'Mantención',          '2016-04-18', 'Jefe de mantención', false);

-- --------------------------------------------------------------------
-- Catálogo base: grúas, plantilla, usuarios, destinatarios
-- --------------------------------------------------------------------
create or replace function demo.cargar_catalogo()
returns void language plpgsql set search_path = public, extensions as $$
begin
  insert into usuarios (id, nombre_completo, rol, rut, id_alternativo, centro_costo, fecha_ingreso, cargo)
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

-- --------------------------------------------------------------------
-- Historial de ~90 días de inspecciones (determinístico con setseed)
-- --------------------------------------------------------------------
create or replace function demo.generar_historial(p_dias integer default 90)
returns void language plpgsql set search_path = public, extensions as $$
declare
  v_demo uuid := (select u.id from usuarios u join auth.users au on au.id = u.id where au.email = 'operador.demo@example.com');
  v_sup  uuid := (select u.id from usuarios u join auth.users au on au.id = u.id where au.email = 'supervisor.demo@example.com');
  v_mant uuid := (select u.id from usuarios u join auth.users au on au.id = u.id where au.email = 'rodrigo.soto@example.com');
  v_hoy  date := (now() at time zone 'America/Santiago')::date;
begin
  perform set_config('demo.sin_notificaciones', 'on', true);
  perform setseed(0.4242);
  drop table if exists _ops, _slots, _reportes;

  -- Operadores ordenados (1 = demo) para asignarlos a grúas/turnos
  create temp table _ops on commit drop as
  select row_number() over (order by p.id_alternativo) as n, u.id
    from usuarios u join auth.users au on au.id = u.id join demo.perfiles p on p.email = au.email
   where u.rol = 'OPERADOR';

  -- 1) "Slots" de inspección: día × grúa × turno
  create temp table _slots on commit drop as
  with dias as (
    select (v_hoy - d) as fecha, d as dias_atras, extract(isodow from v_hoy - d)::int as dow
      from generate_series(0, p_dias - 1) d
  ), base as (
    select dias.fecha, dias.dias_atras, dias.dow, a.id as activo_id, t.turno
      from dias cross join activos a cross join (values (1), (2), (3)) t(turno)
     where dias.dow <> 7                                              -- domingo sin operación
       and not (dias.dow = 6 and t.turno <> 1)                        -- sábado solo turno mañana
       and not (t.turno = 3 and a.id not in (1, 5))                   -- turno noche solo GH-01 y GH-05
       and not (a.id = 6 and dias.dias_atras < 12)                    -- GH-06 fuera de servicio hace 12 días
       and not (a.id = 8 and dias.dow not in (2, 4))                  -- GH-08 en standby: martes y jueves
  )
  select b.*,
         ((b.fecha + make_time(case b.turno when 1 then 7 when 2 then 15 else 23 end, 0, 0))
            at time zone 'America/Santiago')
           + make_interval(mins => 4 + floor(random() * 35)::int) as ts_inicio,
         6 + floor(random() * 13)::int                                as duracion,
         case when b.turno = 3 then 2.0 + random() * 3 else 3.5 + random() * 4 end as uso,
         case when random() < 0.06 then 1 + random() * 3 else 0 end    as salto,
         random() < 0.04                                               as se_salta   -- inspección no realizada
    from base b;

  delete from _slots where se_salta or ts_inicio + make_interval(mins => duracion) > now();

  -- 2) Reportes con operador asignado y horómetro acumulado por grúa
  create temp table _reportes on commit drop as
  select gen_random_uuid() as id, s.*,
         s.ts_inicio + make_interval(mins => s.duracion) as ts_fin,
         (select o.id from _ops o where o.n = case
              when s.turno = 3 then 6
              when s.activo_id in (1, 2) then case when s.turno = 1 then 1 else 2 end
              when s.activo_id in (3, 4) then case when s.turno = 1 then 3 else 4 end
              when s.activo_id in (5, 6) then case when s.turno = 1 then 5 else 6 end
              else case when s.turno = 1 then 2 else 1 end end) as usuario_id,
         a.horometro_actual
           + coalesce(sum(s.uso + s.salto) over w_prev, 0) + s.salto     as h_ini
    from _slots s join activos a on a.id = s.activo_id
  window w_prev as (partition by s.activo_id order by s.ts_inicio rows between unbounded preceding and 1 preceding);

  -- Algunos reemplazos (vacaciones / licencias) para que no sea tan perfecto
  update _reportes r set usuario_id = (array(select o.id from _ops o order by o.n))[1 + floor(random() * 6)::int]
   where random() < 0.12;

  insert into reportes_inspeccion (id, activo_id, usuario_id, plantilla_id, timestamp_inicio, timestamp_completado,
                                   duracion_minutos, turno, horometro_inicial, horometro_final, created_at)
  select id, activo_id, usuario_id, 1, ts_inicio, ts_fin, duracion, turno,
         round(h_ini::numeric, 1), round((h_ini + uso)::numeric, 1), ts_fin
    from _reportes;

  -- 3) Respuestas: probabilidad de falla según pregunta, grúa y tendencia en el tiempo
  insert into respuestas_reporte (reporte_id, pregunta_id, respuesta, comentario, created_at)
  select x.id, x.pregunta_id, not x.falla,
         case when x.falla then (array[
           'Se informa a mantención.', 'Se deja registro, se puede operar con precaución.',
           'Requiere revisión en el próximo turno.', 'Avisado al supervisor de turno.'])[1 + floor(random() * 4)::int]
         end,
         x.ts_fin
    from (
      select r.id, r.ts_fin, p.id as pregunta_id,
             random() < (case p.id
                  when 23 then 0.050                                             -- neumáticos
                  when 9  then case when r.activo_id = 3 then 0.110 else 0.012 end  -- fuga hidráulica (GH-03)
                  when 19 then 0.075 - 0.065 * (1 - r.dias_atras / p_dias::float)   -- luces: MEJORANDO
                  when 13 then case when r.activo_id = 5 and r.dias_atras < 21
                                    then 0.14 else 0.004 end                       -- frenos GH-05: EMPEORANDO
                  when 17 then 0.025                                             -- bocina
                  when 18 then 0.030                                             -- alarma retroceso
                  when 20 then 0.015                                             -- cinturón
                  when 21 then 0.010                                             -- extintor
                  when 10 then 0.020                                             -- cadenas
                  when 22 then 0.020                                             -- espejos
                  else 0.004 end)
               * case r.activo_id when 3 then 1.8 when 5 then 1.3 when 7 then 0.6 else 1.0 end
               as falla
        from _reportes r cross join preguntas_plantilla p
    ) x;

  -- 4) Fotos de evidencia (imágenes de ejemplo subidas a seed/ en el bucket)
  insert into fotos_respuesta (respuesta_id, url_storage, created_at)
  select rr.id,
         demo.url_foto(case when p.id = 10 then 'estructura' when c.id = 1 then 'estructura' when c.id = 2 then 'fluidos' when c.id = 3 then 'hidraulico'
                                 when c.id = 4 then 'frenos' when c.id = 5 then 'seguridad' else 'neumaticos' end),
         rr.created_at
    from respuestas_reporte rr
    join preguntas_plantilla p on p.id = rr.pregunta_id
    join categorias_plantilla c on c.id = p.categoria_id
   where not rr.respuesta and random() < 0.45;

  -- 5) Horas omitidas (saltos de horómetro entre inspecciones)
  with ordenados as (
    select id, horometro_inicial,
           lag(horometro_final) over (partition by activo_id order by timestamp_completado) as anterior
      from reportes_inspeccion
  )
  update reportes_inspeccion r
     set horas_uso_omitidas = case when o.horometro_inicial - o.anterior > 0.2
                                   then round((o.horometro_inicial - o.anterior)::numeric, 1) else 0 end
    from ordenados o where o.id = r.id;

  -- 6) Horómetros pendientes: los 2 últimos del operador demo y ~10% de los últimos 2 días
  update reportes_inspeccion set horometro_final = null, horas_uso = null
   where id in (select id from reportes_inspeccion where usuario_id = v_demo
                 order by timestamp_completado desc limit 2)
      or (timestamp_completado > now() - interval '2 days' and random() < 0.10);

  -- 7) Horómetro actual de cada grúa = último valor registrado
  update activos a set horometro_actual = s.h
    from (select activo_id, max(coalesce(horometro_final, horometro_inicial)) h
            from reportes_inspeccion group by activo_id) s
   where s.activo_id = a.id;

  -- 8) Historial de estados (GH-06 fuera de servicio, GH-03 con una detención previa)
  insert into historial_estados_activo (activo_id, es_operativa, motivo, usuario_cambio, fecha_cambio) values
   (3, false, 'Fuga en cilindro de inclinación, espera repuesto', v_mant, now() - interval '47 days'),
   (3, true,  'Cambio de sellos del cilindro de inclinación',     v_mant, now() - interval '44 days'),
   (6, false, 'Falla en transmisión, enviada a taller externo',   v_sup,  (v_hoy - 12 + time '10:30') at time zone 'America/Santiago');

  -- 9) Algunas notificaciones simuladas recientes (para ver cómo quedaría el registro)
  insert into notificaciones_simuladas (reporte_id, canal, destinatario, asunto, detalle, created_at)
  select r.id, 'EMAIL', 'supervisor.demo@example.com',
         format('Inspección con %s falla(s) – %s', r.respuestas_malas, a.nombre),
         jsonb_build_object('activo', a.nombre, 'score', r.score_cumplimiento, 'modo', 'SIMULADO: no se envió ningún correo ni push'),
         r.timestamp_completado
    from reportes_inspeccion r join activos a on a.id = r.activo_id
   where r.tiene_problemas and r.timestamp_completado > now() - interval '7 days';

  perform set_config('demo.sin_notificaciones', 'off', true);
end;
$$;

-- URL pública de una foto de ejemplo (usa la URL del proyecto guardada en demo.config)
create or replace function demo.url_foto(p_nombre text)
returns text language sql stable set search_path = '' as $$
  select (select valor from demo.config where clave = 'supabase_url')
         || '/storage/v1/object/public/fotos-reportes/seed/' || p_nombre || '.jpg';
$$;

-- --------------------------------------------------------------------
-- Reseteo completo (lo ejecuta pg_cron cada noche)
-- --------------------------------------------------------------------
create or replace function demo.resetear()
returns void language plpgsql set search_path = public, extensions as $$
begin
  truncate notificaciones_simuladas, fotos_respuesta, respuestas_reporte, reportes_inspeccion,
           historial_estados_activo, fcm_tokens, email_destinatarios_activos, email_destinatarios,
           supervisores_activos, preguntas_plantilla, categorias_plantilla, plantillas_checklist,
           activos restart identity cascade;
  perform demo.cargar_catalogo();
  perform demo.generar_historial(90);

  -- Restablece la contraseña pública de las cuentas demo
  update auth.users au
     set encrypted_password = extensions.crypt((select valor from demo.config where clave = 'password_demo'),
                                               extensions.gen_salt('bf'))
   where lower(au.email) in (select email from demo.perfiles where es_cuenta_publica);
end;
$$;

-- --------------------------------------------------------------------
-- Simulación: una inspección nueva por hora en horario laboral,
-- para que el panel "en vivo" muestre actividad.
-- --------------------------------------------------------------------
create or replace function demo.simular_inspeccion()
returns void language plpgsql set search_path = public, extensions as $$
declare
  v_activo activos%rowtype; v_op uuid; v_id uuid := gen_random_uuid(); v_ini timestamptz := now() - interval '9 minutes';
begin
  if random() > 0.7 then return; end if;
  select * into v_activo from activos a
   where a.es_operativa and not a.es_standby
     and not exists (select 1 from reportes_inspeccion r where r.activo_id = a.id and r.timestamp_completado > now() - interval '3 hours')
   order by random() limit 1;
  if not found then return; end if;
  select u.id into v_op from usuarios u join auth.users au on au.id = u.id
   where u.rol = 'OPERADOR' and au.email <> 'operador.demo@example.com' order by random() limit 1;

  insert into reportes_inspeccion (id, activo_id, usuario_id, plantilla_id, timestamp_inicio, timestamp_completado,
                                   duracion_minutos, horometro_inicial)
  values (v_id, v_activo.id, v_op, 1, v_ini, now(), 9, round((coalesce(v_activo.horometro_actual, 0) + random() * 0.4)::numeric, 1));

  insert into respuestas_reporte (reporte_id, pregunta_id, respuesta, comentario)
  select v_id, p.id, f.ok, case when not f.ok then 'Se informa a mantención.' end
    from preguntas_plantilla p
    cross join lateral (select random() >= case when p.id in (23, 9, 17, 18) then 0.05 else 0.004 end as ok) f;
end;
$$;

revoke all on all functions in schema demo from public, anon, authenticated;
