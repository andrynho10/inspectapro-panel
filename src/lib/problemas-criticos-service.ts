import { supabase } from './supabase'

export interface ProblemaCritico {
  pregunta_id: number
  texto_pregunta: string
  total_evaluaciones: number
  total_fallos: number
  porcentaje_fallo: number
  afecta_activos: number
  ultima_ocurrencia: string
  tendencia: 'EMPEORANDO' | 'MEJORANDO' | 'ESTABLE'
  criticidad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  fotos_evidencia: number
}

export interface ProblemaPorActivo {
  pregunta_id: number
  texto_pregunta: string
  total_evaluaciones: number
  total_fallos: number
  porcentaje_fallo: number
  ultima_ocurrencia: string
  fotos_evidencia: number
}

export interface EvolucionProblema {
  fecha: string
  total_evaluaciones: number
  total_fallos: number
  porcentaje_fallo: number
}

export interface ActivoAfectado {
  activo_id: number
  activo_nombre: string
  total_evaluaciones: number
  total_fallos: number
  porcentaje_fallo: number
  ultima_ocurrencia: string
}

export interface GruaProblematica {
  activo_id: number
  activo_nombre: string
  total_reportes: number
  reportes_con_problemas: number
  porcentaje_problemas: number
  score_promedio: number
}

export interface CorrelacionUsoProblemas {
  activo_id: number
  activo_nombre: string
  total_horas_uso_registradas: number
  total_horas_uso_omitidas: number
  total_horas_uso: number
  total_inspecciones: number
  inspecciones_con_problemas: number
  porcentaje_problemas: number
  promedio_horas_por_inspeccion: number
}

/**
 * Retorna todas las preguntas que fallaron al menos una vez, con criticidad calculada en BD,
 * tendencia (EMPEORANDO/MEJORANDO/ESTABLE) y conteo de fotos de evidencia.
 */
export async function obtenerAnalisisProblemasCriticos(dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_analisis_problemas_criticos', { 
      dias_periodo: dias 
    })
    
    if (error) throw error
    return data as ProblemaCritico[]
  } catch (error) {
    console.error('Error obteniendo problemas críticos:', error)
    return []
  }
}

/** Filtra los problemas para una grúa concreta; útil en el drilldown de activo */
export async function obtenerProblemasPorActivo(activoId: number, dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_problemas_por_activo', { 
      activo_id_param: activoId,
      dias_periodo: dias 
    })
    
    if (error) throw error
    return data as ProblemaPorActivo[]
  } catch (error) {
    console.error('Error obteniendo problemas por activo:', error)
    return []
  }
}

/** Serie temporal de fallos de una pregunta concreta; alimenta el gráfico de evolución del problema */
export async function obtenerEvolucionProblema(preguntaId: number, dias: number = 90) {
  try {
    const { data, error } = await supabase.rpc('obtener_evolucion_problema', { 
      pregunta_id_param: preguntaId,
      dias_periodo: dias 
    })
    
    if (error) throw error
    return data as EvolucionProblema[]
  } catch (error) {
    console.error('Error obteniendo evolución de problema:', error)
    return []
  }
}

/** Lista qué grúas han fallado en esa pregunta específica, con su tasa de fallo individual */
export async function obtenerActivosAfectadosPorProblema(preguntaId: number, dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_activos_afectados_por_problema', {
      pregunta_id_param: preguntaId,
      dias_periodo: dias
    })

    if (error) throw error
    return data as ActivoAfectado[]
  } catch (error) {
    console.error('Error obteniendo activos afectados:', error)
    return []
  }
}

export async function obtenerTopGruasProblematicas(limite: number = 20, dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_top_gruas_problematicas', {
      limite,
      dias
    })

    if (error) throw error
    return data as GruaProblematica[]
  } catch (error) {
    console.error('Error obteniendo grúas problemáticas:', error)
    return []
  }
}

/** Reutiliza la RPC de horómetros v2 para cruzar horas de uso con tasa de problemas en esta vista */
export async function obtenerCorrelacionUsoProblemas(dias: number = 90) {
  try {
    const { data, error } = await supabase.rpc('obtener_correlacion_horometro_problemas_v2', {
      p_dias: dias
    })

    if (error) throw error
    return data as CorrelacionUsoProblemas[]
  } catch (error) {
    console.error('Error obteniendo correlación uso-problemas:', error)
    return []
  }
}