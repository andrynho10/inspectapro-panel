import { supabase, Activo } from './supabase'

export type AgregadoDiarioActivo = {
  activo_id: number
  fecha: string
  total_inspecciones: number | null
  inspecciones_con_problemas: number | null
  horas_uso_total: number | null
  horometros_pendientes: number | null
  activo?: {
    nombre: string
  } | null
}

export type ResumenUsoActivo = {
  activoId: number
  nombre: string
  horasUso30: number
  horasUso7: number
  inspecciones30: number
  problemas30: number
  horometrosPendientes: number
}

/** Lista todos los activos (grúas) ordenados por nombre; usada en selectores y tablas de gestión */
export async function obtenerActivos() {
  try {
    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .order('nombre', { ascending: true })
    
    if (error) throw error
    return data as Activo[]
  } catch (error) {
    console.error('Error obteniendo activos:', error)
    return []
  }
}

/** Llama a la RPC para activar/desactivar una grúa y registrar el motivo en el historial de estados */
export async function cambiarEstadoActivo(
  activoId: number,
  esOperativa: boolean,
  usuarioId: string,
  motivo?: string
) {
  try {
    const { data, error } = await supabase.rpc('cambiar_estado_activo', {
      p_activo_id: activoId,
      p_es_operativa: esOperativa,
      p_usuario_id: usuarioId,
      p_motivo: motivo
    })
    
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error cambiando estado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, error: errorMessage }
  }
}

export async function obtenerHistorialEstados(activoId: number) {
  try {
    const { data, error } = await supabase
      .from('historial_estados_activo')
      .select(`
        *,
        usuarios:usuario_cambio(nombre_completo)
      `)
      .eq('activo_id', activoId)
      .order('fecha_cambio', { ascending: false })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo historial:', error)
    return []
  }
}

/**
 * Lee la tabla de agregados diarios pre-calculados (no ejecuta agregaciones en tiempo real).
 * Normaliza el campo activo que Supabase puede devolver como objeto o array según la versión del SDK.
 */
export async function obtenerAgregadosDiariosActivos(dias: number = 30) {
  type AgregadoDiarioRaw = {
    activo_id: number | null
    fecha: string | null
    total_inspecciones: number | null
    inspecciones_con_problemas: number | null
    horas_uso_total: number | null
    horometros_pendientes: number | null
    activo: { nombre: string | null } | { nombre: string | null }[] | null
  }

  try {
    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - (dias - 1))
    const fechaDesdeStr = fechaDesde.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('agregados_diarios')
      .select(`
        activo_id,
        fecha,
        total_inspecciones,
        inspecciones_con_problemas,
        horas_uso_total,
        horometros_pendientes,
        activo:activos(nombre)
      `)
      .gte('fecha', fechaDesdeStr)

    if (error) throw error

    const parsed: AgregadoDiarioActivo[] = []

    for (const item of data ?? []) {
      const raw = item as AgregadoDiarioRaw

      if (raw.activo_id == null || !raw.fecha) {
        continue
      }

      const activoRel = Array.isArray(raw.activo)
        ? raw.activo[0] ?? null
        : raw.activo

      parsed.push({
        activo_id: raw.activo_id,
        fecha: raw.fecha,
        total_inspecciones: raw.total_inspecciones ?? null,
        inspecciones_con_problemas: raw.inspecciones_con_problemas ?? null,
        horas_uso_total: raw.horas_uso_total ?? null,
        horometros_pendientes: raw.horometros_pendientes ?? null,
        activo: activoRel
          ? { nombre: activoRel.nombre ?? 'Sin nombre' }
          : null
      })
    }

    return parsed
  } catch (error) {
    console.error('Error obteniendo agregados diarios:', error)
    return []
  }
}

/**
 * Reduce los agregados diarios a un resumen por activo con acumulados de 30 y 7 días.
 * Función pura (sin llamadas a BD); se puede llamar después de obtenerAgregadosDiariosActivos.
 */
export function construirResumenUsoActivos(
  agregados: AgregadoDiarioActivo[]
): ResumenUsoActivo[] {
  const resumenMap = new Map<number, ResumenUsoActivo>()
  const fechaLimite7 = new Date()
  fechaLimite7.setDate(fechaLimite7.getDate() - 6)

  agregados.forEach((item) => {
    const activoId = item.activo_id
    if (typeof activoId !== 'number') return

    const horasUso = Number(item.horas_uso_total ?? 0) || 0
    const totalInspecciones = Number(item.total_inspecciones ?? 0) || 0
    const totalProblemas = Number(item.inspecciones_con_problemas ?? 0) || 0
    const horometrosPend = Number(item.horometros_pendientes ?? 0) || 0

    const fechaItem = item.fecha ? new Date(item.fecha) : null
    const esUltimos7Dias =
      fechaItem instanceof Date &&
      !Number.isNaN(fechaItem.getTime()) &&
      fechaItem >= fechaLimite7

    if (!resumenMap.has(activoId)) {
      resumenMap.set(activoId, {
        activoId,
        nombre: item.activo?.nombre ?? 'Sin nombre',
        horasUso30: 0,
        horasUso7: 0,
        inspecciones30: 0,
        problemas30: 0,
        horometrosPendientes: 0
      })
    }

    const resumen = resumenMap.get(activoId)!
    resumen.horasUso30 += horasUso
    resumen.inspecciones30 += totalInspecciones
    resumen.problemas30 += totalProblemas
    resumen.horometrosPendientes += horometrosPend
    if (esUltimos7Dias) {
      resumen.horasUso7 += horasUso
    }
  })

  return Array.from(resumenMap.values()).map((resumen) => ({
    ...resumen,
    horasUso30: Number(resumen.horasUso30.toFixed(1)),
    horasUso7: Number(resumen.horasUso7.toFixed(1))
  }))
}

// Alternativa más eficiente que leer agregados_diarios: dos llamadas RPC en paralelo (30d y 7d)
export async function obtenerResumenUsoActivosRPC() {
  try {
    // Carga paralela para minimizar latencia; los resultados se combinan en el cliente
    // Hacer dos llamadas en paralelo: una para 30 días y otra para 7 días
    const [resultado30, resultado7] = await Promise.all([
      supabase.rpc('obtener_correlacion_horometro_problemas', { dias: 30 }),
      supabase.rpc('obtener_correlacion_horometro_problemas', { dias: 7 })
    ])

    if (resultado30.error) throw resultado30.error
    if (resultado7.error) throw resultado7.error

    const data30 = resultado30.data || []
    const data7 = resultado7.data || []

    // Crear un mapa de horas de uso de 7 días por activo_id
    const horasUso7Map = new Map<number, number>()
    for (const item of data7) {
      horasUso7Map.set(item.activo_id, Number(item.total_horas_uso || 0))
    }

    // Transformar datos de 30 días y agregar horas de 7 días
    return data30.map((item: Record<string, unknown>) => ({
      activoId: item.activo_id,
      nombre: item.activo_nombre,
      horasUso30: Number(item.total_horas_uso || 0),
      horasUso7: horasUso7Map.get(Number(item.activo_id)) || 0,
      inspecciones30: Number(item.total_inspecciones || 0),
      problemas30: Number(item.inspecciones_con_problemas || 0),
      horometrosPendientes: 0
    }))
  } catch (error) {
    console.error('Error obteniendo resumen de uso vía RPC:', error)
    return []
  }
}

// CRUD de Activos
export type CrearActivoInput = {
  nombre: string
  modelo: string
  tipo: string
  codigo_qr: string
  es_operativa?: boolean
  horometro_actual?: number | null
}

export type ActualizarActivoInput = {
  nombre?: string
  modelo?: string
  tipo?: string
  codigo_qr?: string
  es_operativa?: boolean
  horometro_actual?: number | null
}

export async function crearActivo(input: CrearActivoInput) {
  try {
    const { data, error } = await supabase
      .from('activos')
      .insert([{
        nombre: input.nombre,
        modelo: input.modelo,
        tipo: input.tipo,
        codigo_qr: input.codigo_qr,
        es_operativa: input.es_operativa ?? true,
        horometro_actual: input.horometro_actual ?? null
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error creando activo:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, error: errorMessage }
  }
}

export async function actualizarActivo(activoId: number, input: ActualizarActivoInput) {
  try {
    const { data, error } = await supabase
      .from('activos')
      .update(input)
      .eq('id', activoId)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error actualizando activo:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, error: errorMessage }
  }
}

export async function eliminarActivo(activoId: number) {
  // Versión demo: eliminar está deshabilitado (el servidor también lo bloquea con RLS)
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return { success: false, error: 'En la versión demo no se pueden eliminar datos' }
  }
  try {
    const { error } = await supabase
      .from('activos')
      .delete()
      .eq('id', activoId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error eliminando activo:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, error: errorMessage }
  }
}

// Tipo para información de tiempo desactivada
export type TiempoDesactivada = {
  dias: number
  horas: number
  fecha_desactivacion: string
  motivo: string | null
  usuario_nombre: string | null
}

// Tipo extendido de Activo con información de tiempo desactivada
export type ActivoConEstado = Activo & {
  dias_desactivada: number | null
  horas_desactivada: number | null
  fecha_desactivacion: string | null
  motivo_desactivacion: string | null
  usuario_desactivacion: string | null
}

// Función para obtener activos con tiempo desactivada (usa función de Supabase)
export async function obtenerActivosConTiempoDesactivada(): Promise<ActivoConEstado[]> {
  try {
    const { data, error } = await supabase.rpc('obtener_activos_con_tiempo_desactivada')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error obteniendo activos con tiempo desactivada:', error)
    return []
  }
}

// Función para calcular tiempo desactivada de un activo específico (usa función de Supabase)
export async function calcularTiempoDesactivada(activoId: number): Promise<TiempoDesactivada | null> {
  try {
    const { data, error } = await supabase.rpc('calcular_tiempo_desactivada', {
      p_activo_id: activoId
    })

    if (error) throw error
    if (!data || data.length === 0) return null

    return data[0] as TiempoDesactivada
  } catch (error) {
    console.error('Error calculando tiempo desactivada:', error)
    return null
  }
}
