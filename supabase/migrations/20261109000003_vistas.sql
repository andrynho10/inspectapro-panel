-- =====================================================================
-- InspectaPro – Demo · 03 · Vistas
-- Todas con security_invoker = true: respetan el RLS de quien consulta
-- (evita el error "Security Definer View" del Security Advisor).
-- =====================================================================

-- Horómetros pendientes de cierre DEL USUARIO CONECTADO (la app no filtra)
create or replace view public.v_horometros_pendientes
with (security_invoker = true) as
select r.id                    as reporte_id,
       a.nombre                as grua,
       u.nombre_completo       as operador,
       r.horometro_inicial,
       r.timestamp_completado,
       r.turno,
       round((extract(epoch from (now() - r.timestamp_completado)) / 3600.0)::numeric, 1)::float8 as horas_desde_reporte
  from public.reportes_inspeccion r
  join public.activos  a on a.id = r.activo_id
  join public.usuarios u on u.id = r.usuario_id
 where r.horometro_pendiente
   and r.usuario_id = (select auth.uid())
 order by r.timestamp_completado desc;

-- Agregados diarios por grúa (pestaña Grúas del panel)
create or replace view public.agregados_diarios
with (security_invoker = true) as
select r.activo_id,
       (r.timestamp_completado at time zone 'America/Santiago')::date as fecha,
       count(*)::int                                              as total_inspecciones,
       count(*) filter (where r.tiene_problemas)::int             as inspecciones_con_problemas,
       round(coalesce(sum(r.horas_uso), 0)::numeric, 1)::float8   as horas_uso_total,
       count(*) filter (where r.horometro_pendiente)::int         as horometros_pendientes
  from public.reportes_inspeccion r
 group by r.activo_id, (r.timestamp_completado at time zone 'America/Santiago')::date;

-- Reportes recientes (en el original era vista materializada; aquí vista normal,
-- así no aparece la advertencia "Materialized View in API" y siempre está al día)
create or replace view public.mv_reportes_recientes
with (security_invoker = true) as
select r.id,
       r.timestamp_completado,
       r.tiene_problemas,
       r.score_cumplimiento,
       r.horometro_pendiente,
       a.nombre          as activo_nombre,
       u.nombre_completo as operador_nombre
  from public.reportes_inspeccion r
  join public.activos  a on a.id = r.activo_id
  join public.usuarios u on u.id = r.usuario_id
 where r.timestamp_completado > now() - interval '7 days';

revoke all on public.v_horometros_pendientes, public.agregados_diarios, public.mv_reportes_recientes from anon;
grant select on public.v_horometros_pendientes, public.agregados_diarios, public.mv_reportes_recientes to authenticated;
