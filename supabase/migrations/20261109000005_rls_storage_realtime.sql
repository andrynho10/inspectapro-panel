-- =====================================================================
-- InspectaPro – Demo · 05 · Row Level Security, Storage y Realtime
-- Reglas de la demo pública:
--   * anon (sin sesión) no ve nada.
--   * NADIE puede borrar datos (no existen políticas DELETE), salvo
--     asignaciones de notificaciones (el panel las guarda con borrar+insertar)
--     y el token push propio.
--   * Operador: crea sus inspecciones/respuestas/fotos y cierra sus horómetros.
--   * Supervisor: además edita grúas, plantillas y destinatarios.
-- Se usa (select auth.uid()) para evitar la advertencia de rendimiento "auth_rls_initplan".
-- =====================================================================

alter table public.usuarios                    enable row level security;
alter table public.activos                     enable row level security;
alter table public.historial_estados_activo    enable row level security;
alter table public.plantillas_checklist        enable row level security;
alter table public.categorias_plantilla        enable row level security;
alter table public.preguntas_plantilla         enable row level security;
alter table public.reportes_inspeccion         enable row level security;
alter table public.respuestas_reporte          enable row level security;
alter table public.fotos_respuesta             enable row level security;
alter table public.fcm_tokens                  enable row level security;
alter table public.email_destinatarios         enable row level security;
alter table public.email_destinatarios_activos enable row level security;
alter table public.supervisores_activos        enable row level security;
alter table public.notificaciones_simuladas    enable row level security;

-- anon no tiene nada que hacer en estas tablas
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- usuarios: lectura para cualquier usuario autenticado (nombres en historiales)
create policy usuarios_select on public.usuarios for select to authenticated using (true);

-- activos
create policy activos_select on public.activos for select to authenticated using (true);
create policy activos_insert on public.activos for insert to authenticated with check ((select private.es_supervisor()));
create policy activos_update on public.activos for update to authenticated
  using ((select private.es_supervisor())) with check ((select private.es_supervisor()));

-- historial de estados (lo escribe cambiar_estado_activo)
create policy historial_select on public.historial_estados_activo for select to authenticated using (true);
create policy historial_insert on public.historial_estados_activo for insert to authenticated
  with check ((select private.es_supervisor()) and usuario_cambio = (select auth.uid()));

-- plantillas, categorías y preguntas
create policy plantillas_select on public.plantillas_checklist for select to authenticated using (true);
create policy plantillas_insert on public.plantillas_checklist for insert to authenticated with check ((select private.es_supervisor()));
create policy plantillas_update on public.plantillas_checklist for update to authenticated
  using ((select private.es_supervisor())) with check ((select private.es_supervisor()));

create policy categorias_select on public.categorias_plantilla for select to authenticated using (true);
create policy categorias_insert on public.categorias_plantilla for insert to authenticated with check ((select private.es_supervisor()));
create policy categorias_update on public.categorias_plantilla for update to authenticated
  using ((select private.es_supervisor())) with check ((select private.es_supervisor()));

create policy preguntas_select on public.preguntas_plantilla for select to authenticated using (true);
create policy preguntas_insert on public.preguntas_plantilla for insert to authenticated with check ((select private.es_supervisor()));
create policy preguntas_update on public.preguntas_plantilla for update to authenticated
  using ((select private.es_supervisor())) with check ((select private.es_supervisor()));

-- reportes: todos leen (historial por grúa), cada uno crea los suyos,
-- se actualiza el propio (cierre de horómetro) o cualquiera si es supervisor
create policy reportes_select on public.reportes_inspeccion for select to authenticated using (true);
create policy reportes_insert on public.reportes_inspeccion for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy reportes_update on public.reportes_inspeccion for update to authenticated
  using (usuario_id = (select auth.uid()) or (select private.es_supervisor()))
  with check (usuario_id = (select auth.uid()) or (select private.es_supervisor()));

-- respuestas y fotos: solo sobre reportes propios
create policy respuestas_select on public.respuestas_reporte for select to authenticated using (true);
create policy respuestas_insert on public.respuestas_reporte for insert to authenticated
  with check (exists (select 1 from public.reportes_inspeccion r
                       where r.id = reporte_id and r.usuario_id = (select auth.uid())));

create policy fotos_select on public.fotos_respuesta for select to authenticated using (true);
create policy fotos_insert on public.fotos_respuesta for insert to authenticated
  with check (exists (select 1 from public.respuestas_reporte rr
                        join public.reportes_inspeccion r on r.id = rr.reporte_id
                       where rr.id = respuesta_id and r.usuario_id = (select auth.uid())));

-- tokens push: cada uno los suyos
create policy fcm_select on public.fcm_tokens for select to authenticated using (usuario_id = (select auth.uid()));
create policy fcm_insert on public.fcm_tokens for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy fcm_update on public.fcm_tokens for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy fcm_delete on public.fcm_tokens for delete to authenticated using (usuario_id = (select auth.uid()));

-- destinatarios de correo y asignaciones (solo supervisores)
create policy dest_select on public.email_destinatarios for select to authenticated using ((select private.es_supervisor()));
create policy dest_insert on public.email_destinatarios for insert to authenticated with check ((select private.es_supervisor()));
create policy dest_update on public.email_destinatarios for update to authenticated
  using ((select private.es_supervisor())) with check ((select private.es_supervisor()));

create policy dest_act_select on public.email_destinatarios_activos for select to authenticated using ((select private.es_supervisor()));
create policy dest_act_insert on public.email_destinatarios_activos for insert to authenticated with check ((select private.es_supervisor()));
create policy dest_act_delete on public.email_destinatarios_activos for delete to authenticated using ((select private.es_supervisor()));

create policy sup_act_select on public.supervisores_activos for select to authenticated using (true);
create policy sup_act_insert on public.supervisores_activos for insert to authenticated with check ((select private.es_supervisor()));
create policy sup_act_delete on public.supervisores_activos for delete to authenticated using ((select private.es_supervisor()));

-- notificaciones simuladas: solo lectura para supervisores (las escribe un trigger)
create policy notif_select on public.notificaciones_simuladas for select to authenticated using ((select private.es_supervisor()));

-- ---------------------------------------------------------------------
-- STORAGE: bucket público de fotos (lectura por URL pública, sin listado)
-- Rutas: reportes/{reporteId}/{preguntaId}/{archivo}.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-reportes', 'fotos-reportes', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Subir: solo usuarios autenticados, solo en la carpeta de un reporte propio
create policy fotos_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-reportes'
    and (storage.foldername(name))[1] = 'reportes'
    and exists (select 1 from public.reportes_inspeccion r
                 where r.id::text = (storage.foldername(name))[2]
                   and r.usuario_id = (select auth.uid()))
  );
-- No hay políticas SELECT/UPDATE/DELETE: las fotos se ven por URL pública,
-- nadie puede listar, sobrescribir ni borrar archivos.

-- ---------------------------------------------------------------------
-- REALTIME: el panel escucha INSERT/UPDATE en reportes_inspeccion
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.reportes_inspeccion;

-- ---------------------------------------------------------------------
-- GraphQL no se usa (app y panel usan REST). Se desactiva para que el
-- Advisor no reporte tablas expuestas por introspección GraphQL.
-- ---------------------------------------------------------------------
drop extension if exists pg_graphql;
