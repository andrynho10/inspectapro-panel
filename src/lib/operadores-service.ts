import { supabase } from './supabase'

export interface AnalisisOperador {
  usuario_id: string
  nombre_completo: string
  rut: string | null
  id_alternativo: string | null
  centro_costo: string | null
  fecha_ingreso: string | null
  cargo: string | null
  total_inspecciones: number
  inspecciones_con_problemas: number
  porcentaje_problemas: number
  score_promedio: number
  duracion_promedio_minutos: number
  duracion_ultima_inspeccion: number | null
  ultima_inspeccion: string
  dias_desde_ultima: number
}

export interface AnalisisCentroCosto {
  centro_costo: string
  total_operadores: number
  total_inspecciones: number
  inspecciones_con_problemas: number
  porcentaje_problemas: number
  score_promedio: number
}

/** Devuelve métricas por operador (inspecciones, score, duración) solo para quienes tienen actividad en el período */
export async function obtenerAnalisisOperadores(dias: number = 90) {
  try {
    const { data, error } = await supabase.rpc('obtener_analisis_operadores', { dias })
    
    if (error) throw error
    return data as AnalisisOperador[]
  } catch (error) {
    console.error('Error obteniendo análisis operadores:', error)
    return []
  }
}

/** Agrega métricas por centro de costo para comparar desempeño entre grupos de operadores */
export async function obtenerAnalisisCentroCosto(dias: number = 90) {
  try {
    const { data, error } = await supabase.rpc('obtener_analisis_centro_costo', { dias })

    if (error) throw error
    return data as AnalisisCentroCosto[]
  } catch (error) {
    console.error('Error obteniendo análisis centro costo:', error)
    return []
  }
}

/**
 * Une la lista completa de operadores (tabla usuarios) con sus métricas de inspección.
 * Operadores sin inspecciones aparecen con valores en 0 y dias_desde_ultima = -1,
 * así la tabla siempre muestra el padrón completo aunque no hayan inspeccionado.
 */
export async function obtenerTodosLosOperadores(dias: number = 90) {
  try {
    // Obtener análisis de operadores con inspecciones
    const { data: operadoresConInspecciones, error: errorRPC } = await supabase.rpc('obtener_analisis_operadores', { dias })

    if (errorRPC) throw errorRPC

    // Obtener TODOS los operadores de la tabla usuarios
    const { data: todosOperadores, error: errorUsuarios } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, rut, id_alternativo, centro_costo, fecha_ingreso, cargo')
      .eq('rol', 'OPERADOR')
      .order('nombre_completo', { ascending: true })

    if (errorUsuarios) throw errorUsuarios

    // Crear un mapa con los operadores que tienen inspecciones
    const mapaInspecciones = new Map<string, AnalisisOperador>()
    for (const op of (operadoresConInspecciones || [])) {
      mapaInspecciones.set(op.usuario_id, op)
    }

    // Combinar: todos los operadores con sus datos de inspección (si existen)
    const resultado: AnalisisOperador[] = (todosOperadores || []).map(operador => {
      const datosInspecciones = mapaInspecciones.get(operador.id)

      if (datosInspecciones) {
        // Operador tiene inspecciones, usar esos datos
        return datosInspecciones
      } else {
        // Operador sin inspecciones, crear entrada con valores en 0
        return {
          usuario_id: operador.id,
          nombre_completo: operador.nombre_completo,
          rut: operador.rut,
          id_alternativo: operador.id_alternativo,
          centro_costo: operador.centro_costo,
          fecha_ingreso: operador.fecha_ingreso,
          cargo: operador.cargo,
          total_inspecciones: 0,
          inspecciones_con_problemas: 0,
          porcentaje_problemas: 0,
          score_promedio: 0,
          duracion_promedio_minutos: 0,
          duracion_ultima_inspeccion: null,
          ultima_inspeccion: '',
          dias_desde_ultima: -1 // -1 indica "sin inspecciones"
        }
      }
    })

    return resultado
  } catch (error) {
    console.error('Error obteniendo todos los operadores:', error)
    return []
  }
}