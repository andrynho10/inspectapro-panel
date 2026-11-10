import { supabase, KPIsDashboard } from './supabase'

/** Llama a la función PostgreSQL que agrega todos los KPIs del dashboard en un solo viaje a la BD */
export async function obtenerKPIs(): Promise<KPIsDashboard | null> {
  try {
    const { data, error } = await supabase.rpc('obtener_kpis_dashboard')
    
    if (error) throw error
    return data as KPIsDashboard
  } catch (error) {
    console.error('Error obteniendo KPIs:', error)
    return null
  }
}

/** Retorna una fila por día con inspecciones, score promedio y problemas para graficar la tendencia */
export async function obtenerTendenciaDiaria(dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_tendencia_diaria', { dias })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo tendencia:', error)
    return []
  }
}

/** Compara métricas (score, problemas, horas) entre los tres turnos del período indicado */
export async function obtenerAnalisisTurnos(dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_analisis_turnos', { dias })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo análisis de turnos:', error)
    return null
  }
}

/** Ranking de grúas ordenado por porcentaje de reportes con problemas; usado en widgets del dashboard */
export async function obtenerTopGruasProblematicas(limite: number = 5, dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_top_gruas_problematicas', { 
      limite, 
      dias 
    })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo top grúas:', error)
    return []
  }
}

/** Devuelve una fila por (grúa × día) con score e inspecciones para alimentar el componente Heatmap */
export async function obtenerHeatmapGruas(dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_heatmap_gruas', { dias })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo heatmap:', error)
    return []
  }
}

/** Usa la RPC dinámica para listar los ítems de checklist con mayor tasa de fallo en el período */
export async function obtenerTopProblemas(dias: number = 30) {
  try {
    const { data, error } = await supabase.rpc('obtener_top_problemas_dinamico', { dias })
    
    if (error) throw error
    return data
  } catch (error) {
    console.error('Error obteniendo top problemas:', error)
    return []
  }
}