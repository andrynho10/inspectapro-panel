import { createBrowserClient } from '@supabase/ssr'

// Variables de entorno requeridas en tiempo de build; el ! indica que se garantizan en runtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente Supabase singleton compartido por toda la app (solo lado cliente, usa cookies de SSR)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Tipos para las tablas principales
export interface Usuario {
  id: string
  nombre_completo: string
  rol: 'OPERADOR' | 'SUPERVISOR'
  email?: string
  created_at?: string
}

export interface Activo {
  id: number
  nombre: string
  modelo: string
  tipo: string
  codigo_qr: string
  es_operativa: boolean
  horometro_actual: number | null
  created_at?: string
}

export interface ReporteInspeccion {
  id: string
  activo_id: number
  usuario_id: string
  plantilla_id: number
  timestamp_inicio: string
  timestamp_completado: string
  duracion_minutos: number
  tiene_problemas: boolean
  total_respuestas: number
  respuestas_malas: number
  score_cumplimiento: number
  turno: number | null
  horometro_inicial: number | null
  horometro_final: number | null
  horometro_pendiente: boolean
  horas_uso: number | null
  horas_uso_omitidas: number | null
}

// Estructura de respuesta de la RPC obtener_kpis_dashboard
export interface KPIsDashboard {
  total_reportes_hoy: number
  total_reportes_semana: number
  total_reportes_mes: number
  score_promedio_global: number
  reportes_con_problemas: number
  porcentaje_con_problemas: number
  activos_inspeccionados: number
  total_activos: number
  horometros_pendientes: number
  horas_uso_total_mes: number
}