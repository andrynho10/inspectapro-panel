// Edge Function: mantenimiento nocturno de la demo
// Borra del bucket "fotos-reportes" las fotos subidas por visitantes (carpeta reportes/),
// manteniendo las imágenes de ejemplo (carpeta seed/). La invoca pg_cron después del reseteo.
// Protegida con un secreto compartido (CRON_SECRET), no con la sesión de un usuario.
import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'fotos-reportes'

Deno.serve(async (req) => {
  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Recorre carpetas recursivamente bajo reportes/
  const archivos: string[] = []
  async function recorrer(prefijo: string, profundidad = 0) {
    if (profundidad > 4) return
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(BUCKET).list(prefijo, { limit: 1000, offset })
      if (error) throw error
      if (!data?.length) break
      for (const item of data) {
        const ruta = `${prefijo}/${item.name}`
        if (item.id) archivos.push(ruta) // archivo
        else await recorrer(ruta, profundidad + 1) // carpeta
      }
      if (data.length < 1000) break
    }
  }

  try {
    await recorrer('reportes')
    let borrados = 0
    for (let i = 0; i < archivos.length; i += 100) {
      const lote = archivos.slice(i, i + 100)
      const { error } = await admin.storage.from(BUCKET).remove(lote)
      if (error) throw error
      borrados += lote.length
    }
    return new Response(JSON.stringify({ ok: true, borrados }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
