-- =====================================================================
-- InspectaPro – Demo · 11 · Validación de fechas de inspección
-- La fecha de la inspección la envía el teléfono (necesario para el modo
-- offline), así que el servidor valida que sea plausible:
--   * no más de 5 minutos en el futuro (tolerancia de reloj)
--   * no más antigua que 7 días (margen para equipos sin señal)
--   * inicio anterior al término y duración máxima de 12 horas
-- Solo aplica a usuarios; las tareas internas (semilla/cron) no se validan.
-- =====================================================================
create or replace function private.tg_validar_fechas_reporte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.timestamp_completado is not distinct from old.timestamp_completado
     and new.timestamp_inicio is not distinct from old.timestamp_inicio then
    return new;
  end if;

  if new.timestamp_completado > now() + interval '5 minutes' then
    raise exception 'Fecha de inspección inválida: está en el futuro'
      using errcode = 'P0422', hint = 'Revisa la fecha y hora del teléfono.';
  end if;
  if new.timestamp_completado < now() - interval '7 days' then
    raise exception 'Fecha de inspección inválida: tiene más de 7 días de antigüedad'
      using errcode = 'P0422';
  end if;
  if new.timestamp_inicio is not null and (
       new.timestamp_inicio > new.timestamp_completado
       or new.timestamp_completado - new.timestamp_inicio > interval '12 hours') then
    raise exception 'Fecha de inspección inválida: el inicio debe ser anterior al término (máx. 12 h)'
      using errcode = 'P0422';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_validar_fechas_reporte() from public, anon, authenticated;

create trigger validar_fechas_reporte
before insert or update of timestamp_inicio, timestamp_completado on public.reportes_inspeccion
for each row execute function private.tg_validar_fechas_reporte();
