-- =====================================================================
-- InspectaPro – Demo · 07 · Tareas programadas (pg_cron, incluido en plan gratuito)
-- Horas en UTC. Chile continental = UTC-3 (verano) / UTC-4 (invierno).
-- =====================================================================
create extension if not exists pg_cron;

-- Reseteo completo todas las noches (~04:00 hora de Chile)
select cron.schedule('demo-reset-nocturno', '0 7 * * *', $$select demo.resetear()$$);

-- Una inspección simulada por hora en horario laboral (~08:00–20:00 Chile, lunes a sábado)
select cron.schedule('demo-simular-inspeccion', '17 11-23 * * 1-6', $$select demo.simular_inspeccion()$$);
