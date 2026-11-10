import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Herramientas que el asistente de IA puede usar.
 * Son SOLO consultas de lectura predefinidas (funciones RPC en Supabase).
 * La IA nunca escribe SQL: elige una herramienta y sus parámetros, y el servidor
 * la ejecuta con la sesión del supervisor (RLS activo).
 */

type Args = Record<string, unknown>

const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'STRING', description, ...extra })
const I = (description: string) => ({ type: 'INTEGER', description })
const B = (description: string) => ({ type: 'BOOLEAN', description })

const filtros = {
  desde: S('Fecha inicial inclusive, formato YYYY-MM-DD'),
  hasta: S('Fecha final inclusive, formato YYYY-MM-DD'),
  grua: S('Nombre de la grúa, ej: GH-05'),
  operador: S('Nombre o parte del nombre del operador, ej: Camila'),
  turno: I('Turno: 1 (07-15 h), 2 (15-23 h) o 3 (23-07 h)'),
  item: S('Parte del texto del ítem del checklist, ej: freno, neumático, bocina'),
}

export const declaracionesHerramientas = [
  {
    name: 'catalogo',
    description: 'Lista grúas (con estado), operadores, categorías e ítems del checklist, y el rango de fechas con datos. Úsala para resolver nombres antes de filtrar.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'kpis_generales',
    description: 'KPIs globales: inspecciones hoy/semana/30 días, % con problemas, score promedio, horómetros pendientes, horas de uso del mes.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'conteo_inspecciones',
    description: 'Cuenta inspecciones y fallas con filtros, agrupando por una dimensión. Devuelve por grupo: inspecciones, con_fallas, porcentaje_con_fallas, items_con_falla, score_promedio y horas_uso. Con agrupar=falla o categoria, "inspecciones" es el total evaluado y "con_fallas" las inspecciones donde ese ítem falló.',
    parameters: {
      type: 'OBJECT',
      properties: {
        agrupar: S('Dimensión de agrupación', { enum: ['ninguno', 'grua', 'operador', 'turno', 'dia', 'semana', 'mes', 'falla', 'categoria', 'centro_costo'] }),
        ...filtros,
        categoria: S('Parte del nombre de la categoría, ej: Frenos, Neumáticos'),
        solo_con_fallas: B('true para considerar solo inspecciones con alguna falla'),
      },
      required: ['agrupar'],
    },
  },
  {
    name: 'listar_inspecciones',
    description: 'Lista inspecciones concretas (más recientes primero) con fecha, grúa, operador, turno, score, ítems con falla y si el horómetro quedó pendiente. Úsala para citar casos y enlazar reportes.',
    parameters: {
      type: 'OBJECT',
      properties: { ...filtros, solo_con_fallas: B('Solo inspecciones con fallas'), limite: I('Máximo de filas (1-25, por defecto 10)') },
    },
  },
  {
    name: 'problemas_criticos',
    description: 'Ranking de ítems con falla en un periodo: % de fallo, criticidad (CRITICA/ALTA/MEDIA/BAJA), tendencia (EMPEORANDO/MEJORANDO/ESTABLE), grúas afectadas y fotos de evidencia.',
    parameters: { type: 'OBJECT', properties: { dias: I('Días hacia atrás desde hoy (por defecto 30)') } },
  },
  {
    name: 'estado_gruas',
    description: 'Estado actual de cada grúa: operativa o fuera de servicio (con días, motivo y quién la desactivó), standby y horómetro actual.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'horometros',
    description: 'Horas de uso registradas y omitidas por grúa en un periodo, días sin actualizar horómetro y operadores con cierres de horómetro pendientes.',
    parameters: { type: 'OBJECT', properties: { dias: I('Días hacia atrás (por defecto 30)') } },
  },
  {
    name: 'gruas_sin_inspeccion',
    description: 'Grúas que no tuvieron ninguna inspección en una fecha dada.',
    parameters: { type: 'OBJECT', properties: { fecha: S('Fecha YYYY-MM-DD') }, required: ['fecha'] },
  },
  {
    name: 'analisis_operadores',
    description: 'Por operador: inspecciones, % con problemas, score promedio, duración promedio y días desde su última inspección.',
    parameters: { type: 'OBJECT', properties: { dias: I('Días hacia atrás (por defecto 30)') } },
  },
]

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null)
const int = (v: unknown, def: number | null = null, min = 1, max = 365) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def
}
const fecha = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** Texto corto para mostrar al usuario qué datos se consultaron */
export function etiquetaConsulta(nombre: string, a: Args): string {
  const partes: string[] = []
  const titulos: Record<string, string> = {
    catalogo: 'Catálogo', kpis_generales: 'KPIs generales', conteo_inspecciones: 'Conteo',
    listar_inspecciones: 'Listado de inspecciones', problemas_criticos: 'Problemas críticos',
    estado_gruas: 'Estado de grúas', horometros: 'Horómetros', gruas_sin_inspeccion: 'Grúas sin inspección',
    analisis_operadores: 'Análisis de operadores',
  }
  if (a.agrupar && a.agrupar !== 'ninguno') partes.push(`por ${a.agrupar}`)
  for (const k of ['grua', 'operador', 'item', 'categoria']) if (a[k]) partes.push(String(a[k]))
  if (a.turno) partes.push(`turno ${a.turno}`)
  if (a.desde || a.hasta) partes.push(`${a.desde ?? '…'} → ${a.hasta ?? 'hoy'}`)
  if (a.dias) partes.push(`${a.dias} días`)
  if (a.fecha) partes.push(String(a.fecha))
  if (a.solo_con_fallas) partes.push('solo con fallas')
  return [titulos[nombre] ?? nombre, ...partes].join(' · ')
}

/** Ejecuta una herramienta con la sesión del usuario y devuelve datos (recortados) */
export async function ejecutarHerramienta(sb: SupabaseClient, nombre: string, a: Args): Promise<unknown> {
  const rpc = async (fn: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await sb.rpc(fn, params)
    if (error) return { error: error.message }
    return data
  }
  const filtrosRpc = () => ({
    p_desde: fecha(a.desde), p_hasta: fecha(a.hasta), p_grua: str(a.grua),
    p_operador: str(a.operador), p_turno: int(a.turno, null, 1, 3), p_item: str(a.item),
  })

  switch (nombre) {
    case 'catalogo': return rpc('asistente_catalogo')
    case 'kpis_generales': return rpc('obtener_kpis_dashboard')
    case 'conteo_inspecciones':
      return rpc('asistente_conteo', {
        p_agrupar: str(a.agrupar) ?? 'ninguno', ...filtrosRpc(),
        p_categoria: str(a.categoria), p_solo_con_fallas: a.solo_con_fallas === true,
      })
    case 'listar_inspecciones':
      return rpc('asistente_listar_inspecciones', {
        ...filtrosRpc(), p_solo_con_fallas: a.solo_con_fallas === true, p_limite: int(a.limite, 10, 1, 25),
      })
    case 'problemas_criticos': return rpc('obtener_analisis_problemas_criticos', { dias_periodo: int(a.dias, 30) })
    case 'estado_gruas': return rpc('obtener_activos_con_tiempo_desactivada')
    case 'horometros': {
      const dias = int(a.dias, 30)
      const [resumen, estado, pendientes] = await Promise.all([
        rpc('obtener_resumen_horas_activo', { p_activo_id: null, p_dias: dias }),
        rpc('obtener_estado_horometros'),
        rpc('obtener_operadores_horometros_pendientes'),
      ])
      return { resumen_horas: resumen, estado_actual: estado, operadores_con_pendientes: pendientes }
    }
    case 'gruas_sin_inspeccion': return rpc('asistente_gruas_sin_inspeccion', { p_fecha: fecha(a.fecha) })
    case 'analisis_operadores': return rpc('obtener_analisis_operadores', { dias: int(a.dias, 30) })
    default: return { error: `Herramienta desconocida: ${nombre}` }
  }
}

/** Limita el tamaño de lo que se envía de vuelta al modelo */
export function recortar(datos: unknown, maxChars = 12000): unknown {
  const texto = JSON.stringify(datos ?? null)
  if (texto.length <= maxChars) return datos
  if (Array.isArray(datos)) {
    const parcial: unknown[] = []
    let largo = 2
    for (const fila of datos) {
      largo += JSON.stringify(fila).length + 1
      if (largo > maxChars) break
      parcial.push(fila)
    }
    return { filas: parcial, nota: `Mostrando ${parcial.length} de ${datos.length} filas` }
  }
  return { texto_recortado: texto.slice(0, maxChars) }
}
