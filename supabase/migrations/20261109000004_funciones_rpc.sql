-- =====================================================================
-- InspectaPro – Demo · 04 · Funciones RPC usadas por la app y el panel
-- Todas SECURITY INVOKER (respetan RLS) y con search_path fijo.
-- Firmas y columnas de salida deducidas del código cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DASHBOARD
-- ---------------------------------------------------------------------
create or replace function public.obtener_kpis_dashboard()
returns json language sql stable set search_path = public as $$
  with r30 as (select * from reportes_inspeccion where timestamp_completado >= now() - interval '30 days')
  select json_build_object(
    'total_reportes_hoy', (select count(*) from reportes_inspeccion
                            where (timestamp_completado at time zone 'America/Santiago')::date
                                = (now() at time zone 'America/Santiago')::date),
    'total_reportes_semana', (select count(*) from reportes_inspeccion where timestamp_completado >= now() - interval '7 days'),
    'total_reportes_mes', (select count(*) from r30),
    'score_promedio_global', coalesce((select round(avg(score_cumplimiento)::numeric, 1) from r30), 0),
    'reportes_con_problemas', (select count(*) from r30 where tiene_problemas),
    'porcentaje_con_problemas', coalesce((select round(100.0 * count(*) filter (where tiene_problemas) / nullif(count(*), 0), 1) from r30), 0),
    'activos_inspeccionados', (select count(distinct activo_id) from r30),
    'total_activos', (select count(*) from activos),
    'horometros_pendientes', (select count(*) from reportes_inspeccion where horometro_pendiente),
    'horas_uso_total_mes', coalesce((select round(sum(horas_uso)::numeric, 1) from r30), 0)
  );
$$;

create or replace function public.obtener_tendencia_diaria(dias integer default 30)
returns table (fecha date, total_inspecciones integer, inspecciones_con_problemas integer, score_promedio numeric)
language sql stable set search_path = public as $$
  select (timestamp_completado at time zone 'America/Santiago')::date,
         count(*)::int,
         count(*) filter (where tiene_problemas)::int,
         round(avg(score_cumplimiento)::numeric, 1)
    from reportes_inspeccion
   where timestamp_completado >= now() - make_interval(days => dias)
   group by 1 order by 1;
$$;

create or replace function public.obtener_analisis_turnos(dias integer default 30)
returns json language sql stable set search_path = public as $$
  select coalesce(json_object_agg('turno_' || t.turno, json_build_object(
           'total_inspecciones', coalesce(s.total, 0),
           'con_problemas',      coalesce(s.con_problemas, 0),
           'score_promedio',     coalesce(s.score, 0),
           'horas_uso',          coalesce(s.horas, 0))), '{}'::json)
    from generate_series(1, 3) as t(turno)
    left join (
      select turno, count(*)::int total, count(*) filter (where tiene_problemas)::int con_problemas,
             round(avg(score_cumplimiento)::numeric, 1) score, round(coalesce(sum(horas_uso), 0)::numeric, 1) horas
        from reportes_inspeccion
       where timestamp_completado >= now() - make_interval(days => dias)
       group by turno
    ) s on s.turno = t.turno;
$$;

create or replace function public.obtener_top_gruas_problematicas(limite integer default 5, dias integer default 30)
returns table (activo_id integer, activo_nombre text, total_reportes integer, total_inspecciones integer,
               reportes_con_problemas integer, inspecciones_con_problemas integer,
               porcentaje_problemas numeric, score_promedio numeric, ultima_inspeccion timestamptz)
language sql stable set search_path = public as $$
  select a.id, a.nombre, count(r.*)::int, count(r.*)::int,
         count(*) filter (where r.tiene_problemas)::int, count(*) filter (where r.tiene_problemas)::int,
         round(100.0 * count(*) filter (where r.tiene_problemas) / nullif(count(r.*), 0), 1),
         round(avg(r.score_cumplimiento)::numeric, 1), max(r.timestamp_completado)
    from activos a
    join reportes_inspeccion r on r.activo_id = a.id
   where r.timestamp_completado >= now() - make_interval(days => dias)
   group by a.id, a.nombre
   order by 7 desc nulls last, 8 asc
   limit limite;
$$;

create or replace function public.obtener_heatmap_gruas(dias integer default 30)
returns table (activo_id integer, activo_nombre text, fecha date, score_promedio numeric,
               total_inspecciones integer, tiene_problemas boolean)
language sql stable set search_path = public as $$
  select a.id, a.nombre, (r.timestamp_completado at time zone 'America/Santiago')::date,
         round(avg(r.score_cumplimiento)::numeric, 1), count(*)::int, bool_or(r.tiene_problemas)
    from reportes_inspeccion r join activos a on a.id = r.activo_id
   where r.timestamp_completado >= now() - make_interval(days => dias)
   group by a.id, a.nombre, 3
   order by a.nombre, 3;
$$;

create or replace function public.obtener_top_problemas_dinamico(dias integer default 30)
returns table (pregunta_id integer, texto_pregunta text, categoria_nombre text, total_respuestas integer,
               total_fallo integer, porcentaje_fallo numeric, gruas_afectadas integer)
language sql stable set search_path = public as $$
  select p.id, p.texto, c.nombre, count(*)::int,
         count(*) filter (where not rr.respuesta)::int,
         round(100.0 * count(*) filter (where not rr.respuesta) / nullif(count(*), 0), 1),
         count(distinct r.activo_id) filter (where not rr.respuesta)::int
    from respuestas_reporte rr
    join reportes_inspeccion r on r.id = rr.reporte_id
    join preguntas_plantilla p on p.id = rr.pregunta_id
    join categorias_plantilla c on c.id = p.categoria_id
   where r.timestamp_completado >= now() - make_interval(days => dias)
   group by p.id, p.texto, c.nombre
  having count(*) filter (where not rr.respuesta) > 0
   order by 5 desc
   limit 10;
$$;

-- ---------------------------------------------------------------------
-- HORÓMETROS
-- ---------------------------------------------------------------------
create or replace function public.obtener_correlacion_horometro_problemas(dias integer default 30)
returns table (activo_id integer, activo_nombre text, total_horas_uso numeric, total_inspecciones integer,
               inspecciones_con_problemas integer, porcentaje_problemas numeric, promedio_horas_por_inspeccion numeric)
language sql stable set search_path = public as $$
  select a.id, a.nombre,
         round(coalesce(sum(r.horas_uso), 0)::numeric + coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         count(r.id)::int, count(r.id) filter (where r.tiene_problemas)::int,
         coalesce(round(100.0 * count(r.id) filter (where r.tiene_problemas) / nullif(count(r.id), 0), 1), 0),
         coalesce(round((sum(r.horas_uso) / nullif(count(r.horas_uso), 0))::numeric, 1), 0)
    from activos a
    left join reportes_inspeccion r on r.activo_id = a.id
         and r.timestamp_completado >= now() - make_interval(days => dias)
   group by a.id, a.nombre
   order by a.nombre;
$$;

create or replace function public.obtener_correlacion_horometro_problemas_v2(p_dias integer default 90)
returns table (activo_id integer, activo_nombre text, total_horas_uso_registradas numeric,
               total_horas_uso_omitidas numeric, total_horas_uso numeric, total_inspecciones integer,
               inspecciones_con_problemas integer, porcentaje_problemas numeric, promedio_horas_por_inspeccion numeric)
language sql stable set search_path = public as $$
  select a.id, a.nombre,
         round(coalesce(sum(r.horas_uso), 0)::numeric, 1),
         round(coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         round(coalesce(sum(r.horas_uso), 0)::numeric + coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         count(r.id)::int, count(r.id) filter (where r.tiene_problemas)::int,
         coalesce(round(100.0 * count(r.id) filter (where r.tiene_problemas) / nullif(count(r.id), 0), 1), 0),
         coalesce(round((sum(r.horas_uso) / nullif(count(r.horas_uso), 0))::numeric, 1), 0)
    from activos a
    left join reportes_inspeccion r on r.activo_id = a.id
         and r.timestamp_completado >= now() - make_interval(days => p_dias)
   group by a.id, a.nombre
   order by a.nombre;
$$;

create or replace function public.obtener_eficiencia_horometro_v2(p_dias integer default 90)
returns table (activo_id integer, activo_nombre text, dias_periodo integer, horas_uso_registradas numeric,
               horas_uso_omitidas numeric, horas_uso_total numeric, horas_disponibles_teoricas numeric,
               porcentaje_utilizacion numeric, promedio_horas_dia numeric,
               reportes_con_horometro integer, reportes_sin_horometro integer)
language sql stable set search_path = public as $$
  -- Disponibilidad teórica: 2 turnos de 8 h por día (16 h)
  select a.id, a.nombre, p_dias,
         round(coalesce(sum(r.horas_uso), 0)::numeric, 1),
         round(coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         round(coalesce(sum(r.horas_uso), 0)::numeric + coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         (p_dias * 16)::numeric,
         round(100.0 * (coalesce(sum(r.horas_uso), 0) + coalesce(sum(r.horas_uso_omitidas), 0))::numeric / (p_dias * 16), 1),
         round(((coalesce(sum(r.horas_uso), 0) + coalesce(sum(r.horas_uso_omitidas), 0)) / p_dias)::numeric, 1),
         count(r.id) filter (where r.horometro_final is not null)::int,
         count(r.id) filter (where r.horometro_final is null)::int
    from activos a
    left join reportes_inspeccion r on r.activo_id = a.id
         and r.timestamp_completado >= now() - make_interval(days => p_dias)
   group by a.id, a.nombre
   order by a.nombre;
$$;

create or replace function public.obtener_estado_horometros()
returns table (activo_id integer, activo_nombre text, horometro_actual real, fecha_ultimo_reporte timestamptz,
               dias_sin_actualizacion integer, ultima_grua_operativa boolean)
language sql stable set search_path = public as $$
  select a.id, a.nombre, a.horometro_actual, u.ultimo,
         coalesce(extract(day from now() - u.ultimo)::int, -1), a.es_operativa
    from activos a
    left join lateral (select max(timestamp_completado) ultimo from reportes_inspeccion r where r.activo_id = a.id) u on true
   order by a.nombre;
$$;

create or replace function public.obtener_operadores_horometros_pendientes()
returns table (usuario_id uuid, usuario_nombre text, usuario_rut text, total_pendientes integer, reportes_pendientes jsonb)
language sql stable set search_path = public as $$
  select u.id, u.nombre_completo, u.rut, count(*)::int,
         jsonb_agg(jsonb_build_object(
           'reporte_id', r.id, 'activo_nombre', a.nombre, 'activo_id', a.id,
           'horometro_inicial', r.horometro_inicial, 'turno', r.turno,
           'timestamp_inicio', r.timestamp_inicio, 'timestamp_completado', r.timestamp_completado,
           'dias_pendiente', extract(day from now() - r.timestamp_completado)::int
         ) order by r.timestamp_completado desc)
    from reportes_inspeccion r
    join usuarios u on u.id = r.usuario_id
    join activos  a on a.id = r.activo_id
   where r.horometro_pendiente
   group by u.id, u.nombre_completo, u.rut
   order by 4 desc;
$$;

create or replace function public.obtener_resumen_horas_activo(p_activo_id integer default null, p_dias integer default 90)
returns table (activo_id integer, activo_nombre text, horas_registradas numeric, horas_omitidas numeric,
               total_horas numeric, porcentaje_omitidas numeric, reportes_completos integer,
               reportes_omitidos integer, total_reportes integer)
language sql stable set search_path = public as $$
  select a.id, a.nombre,
         round(coalesce(sum(r.horas_uso), 0)::numeric, 1),
         round(coalesce(sum(r.horas_uso_omitidas), 0)::numeric, 1),
         round((coalesce(sum(r.horas_uso), 0) + coalesce(sum(r.horas_uso_omitidas), 0))::numeric, 1),
         coalesce(round(100.0 * coalesce(sum(r.horas_uso_omitidas), 0)::numeric
               / nullif((coalesce(sum(r.horas_uso), 0) + coalesce(sum(r.horas_uso_omitidas), 0))::numeric, 0), 1), 0),
         count(r.id) filter (where r.horometro_final is not null)::int,
         count(r.id) filter (where coalesce(r.horas_uso_omitidas, 0) > 0)::int,
         count(r.id)::int
    from activos a
    left join reportes_inspeccion r on r.activo_id = a.id
         and r.timestamp_completado >= now() - make_interval(days => p_dias)
   where p_activo_id is null or a.id = p_activo_id
   group by a.id, a.nombre
   order by a.nombre;
$$;

-- Horas omitidas = salto entre el horómetro final de un reporte y el inicial del siguiente
-- (horas que la grúa se usó sin que nadie registrara inspección).
create or replace function public.recalcular_horas_omitidas_activo(p_activo_id integer)
returns json language plpgsql volatile set search_path = public as $$
declare n integer;
begin
  if not (select private.es_supervisor()) then
    return json_build_object('success', false, 'error', 'Solo supervisores');
  end if;
  with ordenados as (
    select id, horometro_inicial,
           lag(coalesce(horometro_final, horometro_inicial)) over (order by timestamp_completado) as anterior
      from reportes_inspeccion
     where activo_id = p_activo_id and horometro_inicial is not null
  )
  update reportes_inspeccion r
     set horas_uso_omitidas = case when o.anterior is not null and o.horometro_inicial - o.anterior > 0.2
                                   then round((o.horometro_inicial - o.anterior)::numeric, 1) else 0 end
    from ordenados o
   where r.id = o.id;
  get diagnostics n = row_count;
  return json_build_object('success', true, 'activo_id', p_activo_id, 'reportes_actualizados', n);
end;
$$;

create or replace function public.recalcular_todas_horas_omitidas()
returns json language plpgsql volatile set search_path = public as $$
declare a record; total integer := 0; res json;
begin
  if not (select private.es_supervisor()) then
    return json_build_object('success', false, 'error', 'Solo supervisores');
  end if;
  for a in select id from activos loop
    res := public.recalcular_horas_omitidas_activo(a.id);
    total := total + coalesce((res->>'reportes_actualizados')::int, 0);
  end loop;
  return json_build_object('success', true, 'reportes_actualizados', total);
end;
$$;

create or replace function public.validar_horometro_inicial(p_activo_id integer, p_horometro_inicial real)
returns json language plpgsql stable set search_path = public as $$
declare ultimo real;
begin
  select horometro_actual into ultimo from activos where id = p_activo_id;
  if not found then
    return json_build_object('valido', false, 'ultimo_horometro', null, 'error', 'Grúa no encontrada');
  end if;
  if p_horometro_inicial < 0 then
    return json_build_object('valido', false, 'ultimo_horometro', ultimo, 'error', 'El horómetro no puede ser negativo');
  end if;
  if ultimo is not null and p_horometro_inicial < ultimo then
    return json_build_object('valido', false, 'ultimo_horometro', ultimo,
      'error', format('El horómetro inicial (%s) no puede ser menor al último registrado (%s)', p_horometro_inicial, ultimo));
  end if;
  if ultimo is not null and p_horometro_inicial - ultimo > 500 then
    return json_build_object('valido', false, 'ultimo_horometro', ultimo,
      'error', format('Diferencia sospechosa: %s h sobre el último registro (%s)', round((p_horometro_inicial - ultimo)::numeric, 1), ultimo));
  end if;
  return json_build_object('valido', true, 'ultimo_horometro', ultimo, 'error', null);
end;
$$;

create or replace function public.cerrar_horometro(p_reporte_id uuid, p_horometro_final real,
                                                   p_usuario_id uuid, p_observaciones text default null)
returns json language plpgsql volatile set search_path = public as $$
declare r reportes_inspeccion%rowtype; horas numeric; transcurrido numeric;
begin
  if p_usuario_id is distinct from (select auth.uid()) then
    return json_build_object('success', false, 'error', 'Usuario no autorizado');
  end if;
  select * into r from reportes_inspeccion where id = p_reporte_id;
  if not found then return json_build_object('success', false, 'error', 'Reporte no encontrado'); end if;
  if r.usuario_id <> p_usuario_id then return json_build_object('success', false, 'error', 'Este reporte pertenece a otro operador'); end if;
  if not r.horometro_pendiente then return json_build_object('success', false, 'error', 'El horómetro de este reporte ya fue cerrado'); end if;
  if p_horometro_final < r.horometro_inicial then
    return json_build_object('success', false, 'error',
      format('El horómetro final (%s) no puede ser menor al inicial (%s)', p_horometro_final, r.horometro_inicial));
  end if;
  horas := round((p_horometro_final - r.horometro_inicial)::numeric, 1);
  transcurrido := round((extract(epoch from now() - coalesce(r.timestamp_inicio, r.timestamp_completado)) / 3600.0)::numeric, 1);
  if horas > 24 then
    return json_build_object('success', false, 'error',
      format('Las horas de uso (%s h) superan un día completo; revisa el valor ingresado', horas));
  end if;
  update reportes_inspeccion
     set horometro_final = p_horometro_final, observaciones_horometro = p_observaciones
   where id = p_reporte_id;
  return json_build_object('success', true, 'horas_uso', horas, 'tiempo_transcurrido', transcurrido,
                           'mensaje', format('Horómetro cerrado: %s h de uso', horas));
end;
$$;

-- En el original refrescaba una vista materializada. Ahora es vista normal: no hace nada.
create or replace function public.refresh_mv_reportes_recientes()
returns void language sql volatile set search_path = public as $$ select; $$;

-- ---------------------------------------------------------------------
-- OPERADORES
-- ---------------------------------------------------------------------
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
   group by u.id
   order by u.nombre_completo;
$$;

create or replace function public.obtener_analisis_centro_costo(dias integer default 90)
returns table (centro_costo text, total_operadores integer, total_inspecciones integer,
               inspecciones_con_problemas integer, porcentaje_problemas numeric, score_promedio numeric)
language sql stable set search_path = public as $$
  select coalesce(u.centro_costo, 'Sin centro de costo'), count(distinct u.id)::int, count(r.id)::int,
         count(r.id) filter (where r.tiene_problemas)::int,
         coalesce(round(100.0 * count(r.id) filter (where r.tiene_problemas) / nullif(count(r.id), 0), 1), 0),
         coalesce(round(avg(r.score_cumplimiento)::numeric, 1), 0)
    from usuarios u
    left join reportes_inspeccion r on r.usuario_id = u.id
         and r.timestamp_completado >= now() - make_interval(days => dias)
   where u.rol = 'OPERADOR'
   group by 1
   order by 1;
$$;

-- ---------------------------------------------------------------------
-- PROBLEMAS CRÍTICOS
-- ---------------------------------------------------------------------
create or replace function public.obtener_analisis_problemas_criticos(dias_periodo integer default 30)
returns table (pregunta_id integer, texto_pregunta text, total_evaluaciones integer, total_fallos integer,
               porcentaje_fallo numeric, afecta_activos integer, ultima_ocurrencia timestamptz,
               tendencia text, criticidad text, fotos_evidencia integer)
language sql stable set search_path = public as $$
  with base as (
    select rr.id, rr.pregunta_id, rr.respuesta, r.activo_id, r.timestamp_completado,
           r.timestamp_completado >= now() - make_interval(days => dias_periodo) / 2 as segunda_mitad
      from respuestas_reporte rr
      join reportes_inspeccion r on r.id = rr.reporte_id
     where r.timestamp_completado >= now() - make_interval(days => dias_periodo)
  ), agg as (
    select b.pregunta_id,
           count(*)::int total, count(*) filter (where not b.respuesta)::int fallos,
           count(distinct b.activo_id) filter (where not b.respuesta)::int activos,
           max(b.timestamp_completado) filter (where not b.respuesta) ultima,
           100.0 * count(*) filter (where not b.respuesta and not b.segunda_mitad) / nullif(count(*) filter (where not b.segunda_mitad), 0) pct1,
           100.0 * count(*) filter (where not b.respuesta and b.segunda_mitad) / nullif(count(*) filter (where b.segunda_mitad), 0) pct2,
           (select count(*) from fotos_respuesta f join base b2 on b2.id = f.respuesta_id
             where b2.pregunta_id = b.pregunta_id and not b2.respuesta)::int fotos
      from base b group by b.pregunta_id
  )
  select p.id, p.texto, a.total, a.fallos, round(100.0 * a.fallos / nullif(a.total, 0), 1), a.activos, a.ultima,
         case when coalesce(a.pct2, 0) - coalesce(a.pct1, 0) > 1.5 then 'EMPEORANDO'
              when coalesce(a.pct1, 0) - coalesce(a.pct2, 0) > 1.5 then 'MEJORANDO'
              else 'ESTABLE' end,
         -- % de fallo por ítem (cada ítem es 1 de ~25 del checklist)
         case when 100.0 * a.fallos / nullif(a.total, 0) >= 5   then 'CRITICA'
              when 100.0 * a.fallos / nullif(a.total, 0) >= 3   then 'ALTA'
              when 100.0 * a.fallos / nullif(a.total, 0) >= 1.5 then 'MEDIA'
              else 'BAJA' end,
         a.fotos
    from agg a join preguntas_plantilla p on p.id = a.pregunta_id
   where a.fallos > 0
   order by 5 desc;
$$;

create or replace function public.obtener_problemas_por_activo(activo_id_param integer, dias_periodo integer default 30)
returns table (pregunta_id integer, texto_pregunta text, total_evaluaciones integer, total_fallos integer,
               porcentaje_fallo numeric, ultima_ocurrencia timestamptz, fotos_evidencia integer)
language sql stable set search_path = public as $$
  select p.id, p.texto, count(*)::int, count(*) filter (where not rr.respuesta)::int,
         round(100.0 * count(*) filter (where not rr.respuesta) / nullif(count(*), 0), 1),
         max(r.timestamp_completado) filter (where not rr.respuesta),
         coalesce(sum((select count(*) from fotos_respuesta f where f.respuesta_id = rr.id)), 0)::int
    from respuestas_reporte rr
    join reportes_inspeccion r on r.id = rr.reporte_id
    join preguntas_plantilla p on p.id = rr.pregunta_id
   where r.activo_id = activo_id_param
     and r.timestamp_completado >= now() - make_interval(days => dias_periodo)
   group by p.id, p.texto
  having count(*) filter (where not rr.respuesta) > 0
   order by 4 desc;
$$;

create or replace function public.obtener_evolucion_problema(pregunta_id_param integer, dias_periodo integer default 90)
returns table (fecha date, total_evaluaciones integer, total_fallos integer, porcentaje_fallo numeric)
language sql stable set search_path = public as $$
  -- Agrupado por semana para que la curva sea legible
  select date_trunc('week', r.timestamp_completado at time zone 'America/Santiago')::date,
         count(*)::int, count(*) filter (where not rr.respuesta)::int,
         round(100.0 * count(*) filter (where not rr.respuesta) / nullif(count(*), 0), 1)
    from respuestas_reporte rr
    join reportes_inspeccion r on r.id = rr.reporte_id
   where rr.pregunta_id = pregunta_id_param
     and r.timestamp_completado >= now() - make_interval(days => dias_periodo)
   group by 1 order by 1;
$$;

create or replace function public.obtener_activos_afectados_por_problema(pregunta_id_param integer, dias_periodo integer default 30)
returns table (activo_id integer, activo_nombre text, total_evaluaciones integer, total_fallos integer,
               porcentaje_fallo numeric, ultima_ocurrencia timestamptz)
language sql stable set search_path = public as $$
  select a.id, a.nombre, count(*)::int, count(*) filter (where not rr.respuesta)::int,
         round(100.0 * count(*) filter (where not rr.respuesta) / nullif(count(*), 0), 1),
         max(r.timestamp_completado) filter (where not rr.respuesta)
    from respuestas_reporte rr
    join reportes_inspeccion r on r.id = rr.reporte_id
    join activos a on a.id = r.activo_id
   where rr.pregunta_id = pregunta_id_param
     and r.timestamp_completado >= now() - make_interval(days => dias_periodo)
   group by a.id, a.nombre
  having count(*) filter (where not rr.respuesta) > 0
   order by 4 desc;
$$;

-- ---------------------------------------------------------------------
-- ESTADO DE GRÚAS
-- ---------------------------------------------------------------------
create or replace function public.cambiar_estado_activo(p_activo_id integer, p_es_operativa boolean,
                                                        p_usuario_id uuid, p_motivo text default null)
returns json language plpgsql volatile set search_path = public as $$
begin
  if not (select private.es_supervisor()) or p_usuario_id is distinct from (select auth.uid()) then
    return json_build_object('success', false, 'error', 'Solo un supervisor puede cambiar el estado');
  end if;
  update activos set es_operativa = p_es_operativa where id = p_activo_id;
  if not found then return json_build_object('success', false, 'error', 'Grúa no encontrada'); end if;
  insert into historial_estados_activo (activo_id, es_operativa, motivo, usuario_cambio)
  values (p_activo_id, p_es_operativa, p_motivo, p_usuario_id);
  return json_build_object('success', true, 'activo_id', p_activo_id, 'es_operativa', p_es_operativa);
end;
$$;

create or replace function public.calcular_tiempo_desactivada(p_activo_id integer)
returns table (dias integer, horas integer, fecha_desactivacion timestamptz, motivo text, usuario_nombre text)
language sql stable set search_path = public as $$
  select extract(day from now() - h.fecha_cambio)::int,
         (extract(epoch from now() - h.fecha_cambio) / 3600)::int % 24,
         h.fecha_cambio, h.motivo, u.nombre_completo
    from activos a
    join lateral (select * from historial_estados_activo x where x.activo_id = a.id
                   order by x.fecha_cambio desc limit 1) h on not h.es_operativa
    left join usuarios u on u.id = h.usuario_cambio
   where a.id = p_activo_id and not a.es_operativa;
$$;

create or replace function public.obtener_activos_con_tiempo_desactivada()
returns table (id integer, nombre text, modelo text, tipo text, codigo_qr text, es_operativa boolean,
               es_standby boolean, horometro_actual real, created_at timestamptz,
               dias_desactivada integer, horas_desactivada integer, fecha_desactivacion timestamptz,
               motivo_desactivacion text, usuario_desactivacion text)
language sql stable set search_path = public as $$
  select a.id, a.nombre, a.modelo, a.tipo, a.codigo_qr, a.es_operativa, a.es_standby, a.horometro_actual, a.created_at,
         t.dias, t.horas, t.fecha_desactivacion, t.motivo, t.usuario_nombre
    from activos a
    left join lateral public.calcular_tiempo_desactivada(a.id) t on true
   order by a.nombre;
$$;

-- ---------------------------------------------------------------------
-- Permisos: solo usuarios autenticados pueden ejecutar las RPC
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
