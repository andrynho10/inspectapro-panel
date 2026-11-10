'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Forklift,
  Users,
  Timer,
  RefreshCw,
  Menu,
  X,
  FileText,
  Settings
} from 'lucide-react'
import { KPICard } from '@/components/KPICard'
import { getCurrentUser, logout } from '@/lib/auth'
import {
  obtenerKPIs,
  obtenerTendenciaDiaria,
  obtenerAnalisisTurnos,
  obtenerTopGruasProblematicas,
  obtenerTopProblemas
} from '@/lib/dashboard-service'
import { KPIsDashboard } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { obtenerResumenUsoActivosRPC, ResumenUsoActivo } from '@/lib/activos-service'
import { obtenerTodosLosOperadores } from '@/lib/operadores-service'
import { obtenerEstadoHorometros } from '@/lib/horometros-service'
import { obtenerReportesConFiltros } from '@/lib/reportes-service'
import ExportButton from '@/components/ExportButton'
import {
  exportarAExcelMultiplesHojas,
  exportarACSV,
  generarNombreArchivo,
  formatearFechaExcel,
  formatearPorcentaje
} from '@/lib/export-utils'

type ReporteReciente = {
  id: string
  timestamp_completado: string
  tiene_problemas: boolean
  score_cumplimiento: number
  activo_nombre: string
  operador_nombre: string
  horometro_pendiente: boolean
}

// Refresca la vista materializada antes de leer, ignorando errores de lock (55P03/55P02)
async function cargarReportesRecientes() {
  try {
    const { error: refreshError } = await supabase.rpc('refresh_mv_reportes_recientes')

    if (refreshError && refreshError.code !== '55P03' && refreshError.code !== '55P02') {
      throw refreshError
    }

    const { data, error } = await supabase
      .from('mv_reportes_recientes')
      .select(`
        id,
        timestamp_completado,
        tiene_problemas,
        score_cumplimiento,
        activo_nombre,
        operador_nombre,
        horometro_pendiente
      `)
      .order('timestamp_completado', { ascending: false })
      .limit(10)

    if (error) throw error
    return (data ?? []) as ReporteReciente[]
  } catch (error) {
    console.error('Error cargando reportes recientes:', error)
    return []
  }
}

function ReportesRecientesSidebar({ reportes, loading, actualizando }: { reportes: ReporteReciente[], loading: boolean, actualizando: boolean }) {
  const router = useRouter()

  const calcularTiempoRelativo = (timestamp: string) => {
    const ahora = new Date()
    const fecha = new Date(timestamp)
    const diffMs = ahora.getTime() - fecha.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'Hace instantes'
    if (diffMin === 1) return 'Hace 1 min'
    if (diffMin < 60) return `Hace ${diffMin} min`

    const diffHoras = Math.floor(diffMin / 60)
    if (diffHoras === 1) return 'Hace 1 hora'
    if (diffHoras < 24) return `Hace ${diffHoras} horas`

    return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  }

  const reportesMostrar = reportes.slice(0, 5)

  return (
    <div className="hidden xl:block xl:sticky xl:top-4 bg-white rounded-lg shadow-lg border-2 border-blue-100">
      {/* Header con badge EN VIVO */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">Actividad Reciente</h3>
          <div className="flex items-center gap-2">
            {actualizando && (
              <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            )}
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500 text-white text-xs font-semibold">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              EN VIVO
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-600">Actualizaciones automáticas</p>
      </div>

      {/* Lista de reportes */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-blue-500" />
            Cargando...
          </div>
        ) : reportesMostrar.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hay reportes recientes</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reportesMostrar.map((reporte, index) => {
              const tiempoRelativo = calcularTiempoRelativo(reporte.timestamp_completado)
              const esReciente = new Date().getTime() - new Date(reporte.timestamp_completado).getTime() < 120000 // < 2 min

              return (
                <button
                  key={reporte.id}
                  onClick={() => router.push(`/dashboard/reportes/${reporte.id}`)}
                  className={`w-full p-3 hover:bg-blue-50 text-left transition-all duration-200 cursor-pointer ${
                    esReciente ? 'bg-blue-50/50' : ''
                  } ${index === 0 ? 'animate-fade-in' : ''}`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    {reporte.tiene_problemas ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {reporte.activo_nombre || 'Activo desconocido'}
                        </p>
                        {reporte.horometro_pendiente && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 flex-shrink-0" title="Horómetro pendiente de completar">
                            <Clock className="w-3 h-3" />
                            H. Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {reporte.operador_nombre || 'Operador desconocido'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className={`font-semibold px-2 py-0.5 rounded ${
                      reporte.tiene_problemas
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {reporte.score_cumplimiento}%
                    </span>
                    <span className={`text-xs ${esReciente ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                      {tiempoRelativo}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={() => router.push('/dashboard/reportes')}
          className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline cursor-pointer"
        >
          Ver todos los reportes →
        </button>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [usuario, setUsuario] = useState<{ id: string; rol: string; nombre_completo: string } | null>(null)
  const [kpis, setKpis] = useState<KPIsDashboard | null>(null)
  const [tendencia, setTendencia] = useState<Array<Record<string, unknown>>>([])
  const [turnos, setTurnos] = useState<Record<string, unknown> | null>(null)
  const [topGruas, setTopGruas] = useState<Array<Record<string, unknown>>>([])
  const [topProblemas, setTopProblemas] = useState<Array<Record<string, unknown>>>([])
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date>(new Date())
  const [resumenUsoActivos, setResumenUsoActivos] = useState<ResumenUsoActivo[]>([])
  const [reportesRecientes, setReportesRecientes] = useState<ReporteReciente[]>([])
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [mostrarTodasGruas, setMostrarTodasGruas] = useState(false)
  const [mostrarTodasGruasProblematicas, setMostrarTodasGruasProblematicas] = useState(false)
  const [navegando, setNavegando] = useState<string | null>(null)

  // Ref para debounce del Realtime: evita re-renders dobles cuando llegan INSERT+UPDATE casi simultáneos
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Normaliza y ordena los datos de tendencia para Recharts; calcula % de problemas en cliente
  const tendenciaDataset = useMemo(() => {
    return tendencia
      .map((item) => {
        const totalInspecciones = Number(item.total_inspecciones ?? 0) || 0
        const rawProblemas =
          Number(
            item.inspecciones_con_problemas ??
            item.reportes_con_problemas ??
            item.total_con_problemas ??
            0
          ) || 0
        const porcentajeProblemas =
          totalInspecciones > 0
            ? Number(((rawProblemas / totalInspecciones) * 100).toFixed(1))
            : 0

        return {
          ...item,
          fecha: String(item.fecha || ''),
          total_inspecciones: totalInspecciones,
          score_promedio: Number(item.score_promedio ?? 0) || 0,
          porcentaje_problemas: porcentajeProblemas,
          inspecciones_con_problemas: rawProblemas
        }
      })
      .sort((a, b) => {
        // Ordenar por fecha ascendente (más antigua a más reciente)
        return a.fecha.localeCompare(b.fecha)
      })
  }, [tendencia])

  // Filtra grúas sin horas registradas y ordena por uso en 30 días para el widget de ranking
  const topUso = useMemo(() => {
    return [...resumenUsoActivos]
      .filter((item) => item.horasUso30 > 0 || item.horasUso7 > 0)
      .sort((a, b) => b.horasUso30 - a.horasUso30)
      .slice(0, 20) // Máximo 20 grúas
  }, [resumenUsoActivos])

  const gruasMostradas = mostrarTodasGruas ? topUso : topUso.slice(0, 5)
  const gruasProblematicasMostradas = mostrarTodasGruasProblematicas ? topGruas : topGruas.slice(0, 5)

  // Carga en paralelo los 7 datasets del dashboard; modo silencioso evita mostrar spinner de carga completa
  const cargarDatos = useCallback(async (silencioso: boolean = false) => {
    if (!silencioso) {
      setLoading(true)
    } else {
      setActualizando(true)
    }

    try {
      const [
        kpisData,
        tendenciaData,
        turnosData,
        gruasData,
        problemasData,
        resumenUsoData,
        reportesData
      ] = await Promise.all([
        obtenerKPIs(),
        obtenerTendenciaDiaria(30),
        obtenerAnalisisTurnos(30),
        obtenerTopGruasProblematicas(10, 30),
        obtenerTopProblemas(30),
        obtenerResumenUsoActivosRPC(),
        cargarReportesRecientes()
      ])

      setKpis(kpisData)
      setTendencia(tendenciaData)
      setTurnos(turnosData)
      setTopGruas(gruasData)
      setTopProblemas(problemasData)
      setResumenUsoActivos(resumenUsoData)
      setReportesRecientes(reportesData)
      setUltimaActualizacion(new Date())
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      if (!silencioso) {
        setLoading(false)
      } else {
        setActualizando(false)
      }
    }
  }, [])

  // Guarda de autenticación: redirige a /login si no hay sesión o el rol no es SUPERVISOR
  const checkAuth = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    setUsuario(user)
    await cargarDatos()
    setLoading(false)
  }, [router, cargarDatos])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // ========================================
  // REALTIME SUBSCRIPTION (Actualización Instantánea)
  // ========================================
  // Escucha INSERT/UPDATE en reportes_inspeccion para refrescar el dashboard sin polling activo;
  // el debounce de 2 s agrupa actualizaciones rápidas sucesivas en una sola recarga
  useEffect(() => {
    if (!usuario) return

    console.log('Conectando a Realtime...')

    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reportes_inspeccion'
        },
        (payload) => {
          console.log('Nuevo reporte detectado:', payload.new)
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(() => cargarDatos(true), 2000)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reportes_inspeccion'
        },
        (payload) => {
          console.log('Reporte actualizado:', payload.new)
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(() => cargarDatos(true), 2000)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Conectado a Realtime')
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Error en canal Realtime')
        }
      })

    return () => {
      console.log('Desconectando Realtime...')
      supabase.removeChannel(channel)
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
    }
  }, [usuario, cargarDatos])

  // ========================================
  // POLLING DE RESPALDO (cada 2 minutos)
  // ========================================
  // Garantiza actualización aunque falle o se corte la suscripción Realtime
  useEffect(() => {
    if (!usuario) return

    console.log('Iniciando polling de respaldo (cada 2 minutos)')

    const intervalo = setInterval(() => {
      console.log('Polling: Actualizando datos...')
      cargarDatos(true)
    }, 120000) // 2 minutos

    return () => {
      console.log('â±ï¸ Deteniendo polling')
      clearInterval(intervalo)
    }
  }, [usuario, cargarDatos])

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  function navegarA(ruta: string) {
    setNavegando(ruta)
    router.push(ruta)
  }

  // Genera Excel de 6 hojas con datos de los últimos 90 días obtenidos en una sola llamada paralela
  async function exportarDashboardCompleto() {
    try {
      // Calcular fecha hace 90 días
      const fecha90DiasAtras = new Date()
      fecha90DiasAtras.setDate(fecha90DiasAtras.getDate() - 90)
      const fechaDesde = fecha90DiasAtras.toISOString()

      // Obtener todos los datos en paralelo
      const [
        reportesData,
        operadoresData,
        estadoHorometrosData,
        kpisData,
        gruasProblematicasData,
        problemasData
      ] = await Promise.all([
        obtenerReportesConFiltros(fechaDesde),
        obtenerTodosLosOperadores(90),
        obtenerEstadoHorometros(),
        obtenerKPIs(),
        obtenerTopGruasProblematicas(20, 90),
        obtenerTopProblemas(90)
      ])

      // HOJA 1: REPORTES (Prioridad máxima)
      const reportes = (reportesData || []).map((r: Record<string, unknown>) => {
        const activo = r.activo as { nombre?: string } | undefined
        const usuario = r.usuario as { nombre_completo?: string; rut?: string; centro_costo?: string } | undefined
        return {
        'ID Reporte': r.id,
        'Fecha/Hora Completado': formatearFechaExcel(r.timestamp_completado as string),
        'Grúa': activo?.nombre || '-',
        'Operador': usuario?.nombre_completo || '-',
        'RUT Operador': usuario?.rut || '-',
        'Centro de Costo': usuario?.centro_costo || '-',
        'Turno': r.turno ? `Turno ${r.turno}` : '-',
        'Duración (min)': r.duracion_minutos || 0,
        'Score (%)': formatearPorcentaje(Number(r.score_cumplimiento) || 0, 2),
        '¿Tiene Problemas?': r.tiene_problemas ? 'Sí' : 'No',
        'Total Respuestas': r.total_respuestas || 0,
        'Respuestas Malas': r.respuestas_malas || 0,
        'Horómetro Inicial (h)': r.horometro_inicial || '-',
        'Horómetro Final (h)': r.horometro_final || '-',
        'Horas de Uso': typeof r.horas_uso === 'number' ? r.horas_uso.toFixed(2) : '-'
        }
      })

      // HOJA 2: KPIs GENERALES
      const kpisHoja = kpisData ? [{
        'Reportes Hoy': kpisData.total_reportes_hoy || 0,
        'Reportes Semana': kpisData.total_reportes_semana || 0,
        'Reportes Mes (30d)': kpisData.total_reportes_mes || 0,
        'Score Promedio Global': formatearPorcentaje(kpisData.score_promedio_global || 0, 2),
        'Reportes con Problemas': kpisData.reportes_con_problemas || 0,
        '% Con Problemas': formatearPorcentaje(kpisData.porcentaje_con_problemas || 0, 2),
        'Activos Inspeccionados': kpisData.activos_inspeccionados || 0,
        'Total Activos': kpisData.total_activos || 0,
        'Horómetros Pendientes': kpisData.horometros_pendientes || 0,
        'Horas Uso Total Mes': kpisData.horas_uso_total_mes?.toFixed(2) || '0'
      }] : []

      // HOJA 3: TOP GRÚAS PROBLEMÁTICAS
      const gruasProblematicas = (gruasProblematicasData || []).map((g: Record<string, unknown>) => ({
        'Grúa': g.activo_nombre,
        'Total Inspecciones': g.total_inspecciones || g.total_reportes || 0,
        'Inspecciones con Problemas': g.inspecciones_con_problemas || g.reportes_con_problemas || 0,
        '% Problemas': formatearPorcentaje(Number(g.porcentaje_problemas) || 0, 1),
        'Score Promedio': formatearPorcentaje(Number(g.score_promedio) || 0, 1),
        'Última Inspección': g.ultima_inspeccion ? formatearFechaExcel(g.ultima_inspeccion as string) : '-'
      }))

      // HOJA 4: TOP PROBLEMAS DETECTADOS
      const problemasDetectados = (problemasData || []).map((p: Record<string, unknown>) => ({
        'Problema/Ítem': p.pregunta_texto || p.texto_pregunta || '-',
        'Categoría': p.categoria_nombre || '-',
        'Veces Detectado': p.veces_detectado || p.total_fallo || 0,
        '% Ocurrencia': formatearPorcentaje(Number(p.porcentaje_ocurrencia) || Number(p.porcentaje_fallo) || 0, 1),
        'Grúas Afectadas': p.gruas_afectadas || 0
      }))

      // HOJA 5: RENDIMIENTO OPERADORES
      const rendimientoOperadores = operadoresData
        .filter(op => op.total_inspecciones > 0)
        .map(op => ({
          'Operador': op.nombre_completo,
          'RUT': op.rut || '-',
          'Centro de Costo': op.centro_costo || '-',
          'Total Inspecciones': op.total_inspecciones,
          '% Reportes con Problemas': formatearPorcentaje(op.porcentaje_problemas, 2),
          'Score Promedio': formatearPorcentaje(op.score_promedio, 2),
          'Duración Promedio (min)': op.duracion_promedio_minutos > 0
            ? op.duracion_promedio_minutos.toFixed(2)
            : '-',
          'Última Inspección': op.dias_desde_ultima === -1
            ? 'Sin inspecciones'
            : op.dias_desde_ultima === 0
              ? 'Hoy'
              : `Hace ${Math.floor(op.dias_desde_ultima)} días`
        }))

      // HOJA 6: ESTADO HORÓMETROS
      const estadoHorometros = estadoHorometrosData.map(e => ({
        'Grúa': e.activo_nombre,
        'Horómetro Actual (h)': e.horometro_actual || 'N/A',
        'Fecha Último Reporte': e.fecha_ultimo_reporte
          ? formatearFechaExcel(e.fecha_ultimo_reporte)
          : 'Sin reportes',
        'Días Sin Actualización': e.dias_sin_actualizacion ?? 'N/A',
        'Estado Operativo': e.ultima_grua_operativa ? 'Operativa' : 'Inactiva'
      }))

      // Crear Excel con 6 hojas
      const hojas = [
        { nombre: 'Reportes', datos: reportes },
        { nombre: 'KPIs', datos: kpisHoja },
        { nombre: 'Grúas Problemáticas', datos: gruasProblematicas },
        { nombre: 'Top Problemas', datos: problemasDetectados },
        { nombre: 'Operadores', datos: rendimientoOperadores },
        { nombre: 'Horómetros', datos: estadoHorometros }
      ]

      const nombreArchivo = generarNombreArchivo('dashboard_completo', 'xlsx')
      exportarAExcelMultiplesHojas(hojas, nombreArchivo)
    } catch (error) {
      console.error('Error al exportar dashboard completo:', error)
      alert('Error al generar la exportación completa')
    }
  }

  // Exportación ligera: solo los reportes planos en CSV, sin datos agregados
  async function exportarReportesCSV() {
    try {
      // Calcular fecha hace 90 días
      const fecha90DiasAtras = new Date()
      fecha90DiasAtras.setDate(fecha90DiasAtras.getDate() - 90)
      const fechaDesde = fecha90DiasAtras.toISOString()

      const reportesData = await obtenerReportesConFiltros(fechaDesde)

      const reportes = (reportesData || []).map((r: Record<string, unknown>) => {
        const activo = r.activo as { nombre?: string } | undefined
        const usuario = r.usuario as { nombre_completo?: string; rut?: string; centro_costo?: string } | undefined
        return {
        'ID Reporte': r.id,
        'Fecha/Hora Completado': formatearFechaExcel(r.timestamp_completado as string),
        'Grúa': activo?.nombre || '-',
        'Operador': usuario?.nombre_completo || '-',
        'RUT Operador': usuario?.rut || '-',
        'Centro de Costo': usuario?.centro_costo || '-',
        'Turno': r.turno ? `Turno ${r.turno}` : '-',
        'Duración (min)': r.duracion_minutos || 0,
        'Score (%)': formatearPorcentaje(Number(r.score_cumplimiento) || 0, 2),
        '¿Tiene Problemas?': r.tiene_problemas ? 'Sí' : 'No',
        'Total Respuestas': r.total_respuestas || 0,
        'Respuestas Malas': r.respuestas_malas || 0,
        'Horómetro Inicial (h)': r.horometro_inicial || '-',
        'Horómetro Final (h)': r.horometro_final || '-',
        'Horas de Uso': typeof r.horas_uso === 'number' ? r.horas_uso.toFixed(2) : '-'
        }
      })

      const nombreArchivo = generarNombreArchivo('reportes_dashboard', 'csv')
      exportarACSV(reportes, nombreArchivo)
    } catch (error) {
      console.error('Error al exportar reportes:', error)
      alert('Error al generar la exportación de reportes')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow relative z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Layout con 3 secciones: izquierda, centro, derecha */}
          <div className="flex items-center justify-between lg:grid lg:grid-cols-[300px_1fr_auto] lg:gap-4">
            {/* Sección Izquierda: Título e Info */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Supervisor</h1>
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.svg"
                  alt="Logo InspectaPro"
                  unoptimized
                  width={20}
                  height={20}
                  className="object-contain"
                />
                <p className="text-sm text-gray-600">InspectaPro Demo - {usuario?.nombre_completo}</p>
              </div>

              {/* Indicador de Última Actualización */}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-400">
                  Última Actualización: {ultimaActualizacion.toLocaleTimeString('es-CL')}
                </p>
                <button
                  onClick={() => cargarDatos()}
                  disabled={actualizando}
                  className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400 flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <RefreshCw className={`w-3 h-3 ${actualizando ? 'animate-spin' : ''}`} />
                  {actualizando ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>
            </div>

            {/* Sección Centro: Botones de Navegación (solo desktop) */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="flex items-center gap-2">
                {/* Botón de Gestión de Grúas */}
                <button
                  onClick={() => navegarA('/dashboard/gruas')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[150px] px-3 py-2 bg-blue-600 text-white text-base font-normal rounded-md hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/gruas' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <Forklift className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Gestión Grúas</span>
                </button>
                {/* Botón Reportes */}
                <button
                  onClick={() => navegarA('/dashboard/reportes')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[150px] px-3 py-2 bg-cyan-600 text-white text-base font-normal rounded-md hover:bg-cyan-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/reportes' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Reportes</span>
                </button>
                {/* Botón Heatmap */}
                <button
                  onClick={() => navegarA('/dashboard/heatmap')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[150px] px-3 py-2 bg-purple-600 text-white text-base font-normal rounded-md hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/heatmap' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <BarChart3 className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Heatmap</span>
                </button>
                {/* Botón Horómetros */}
                <button
                  onClick={() => navegarA('/dashboard/horometros')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[150px] px-3 py-2 bg-green-600 text-white text-base font-normal rounded-md hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/horometros' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <Timer className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Horómetros</span>
                </button>
                {/* Botón Operadores */}
                <button
                  onClick={() => navegarA('/dashboard/operadores')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[150px] px-3 py-2 bg-orange-600 text-white text-base font-normal rounded-md hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/operadores' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Operadores</span>
                </button>
                {/* Botón Problemas Críticos */}
                <button
                  onClick={() => navegarA('/dashboard/problemas-criticos')}
                  disabled={navegando !== null}
                  className="flex items-center justify-center w-[170px] px-3 py-2 bg-red-600 text-white text-base font-normal rounded-md hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {navegando === '/dashboard/problemas-criticos' ? (
                    <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="whitespace-nowrap">Problemas Críticos</span>
                </button>
              </div>
            </div>

            {/* Sección Derecha: Cerrar Sesión y Hamburguesa */}
            <div className="flex items-center justify-end gap-3">
              {/* Botón Notificaciones - Solo Ícono (solo desktop) */}
              <button
                onClick={() => navegarA('/dashboard/notificaciones')}
                disabled={navegando !== null}
                className="hidden lg:flex items-center justify-center p-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                title="Configurar notificaciones"
                aria-label="Configurar notificaciones"
              >
                {navegando === '/dashboard/notificaciones' ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Settings className="w-5 h-5" />
                )}
              </button>

              {/* Botón Cerrar Sesión (solo desktop) */}
              <button
                onClick={handleLogout}
                className="hidden lg:block px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 cursor-pointer"
              >
                Cerrar Sesión
              </button>

              {/* Botón Hamburguesa (solo móvil/tablet) */}
              <button
                onClick={() => setMenuMovilAbierto(true)}
                className="lg:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer"
                aria-label="Abrir menú"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          {/* Columna Izquierda: Botones de Exportación (solo desktop) */}
          <div className="hidden xl:block w-64 flex-shrink-0">
            <div className="sticky top-4 space-y-4">
              <div className="bg-white rounded-lg shadow-lg border-2 border-green-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-green-600" />
                  <h3 className="text-sm font-bold text-gray-900">Exportar Datos</h3>
                </div>
                <p className="text-xs text-gray-600 mb-4">Descarga información consolidada del sistema</p>

                <div className="space-y-3">
                  <ExportButton
                    onExport={exportarDashboardCompleto}
                    label="Exportar Completo"
                    variant="primary"
                    icon="excel"
                    disabled={!kpis}
                    className="w-full justify-center"
                  />
                  <ExportButton
                    onExport={exportarReportesCSV}
                    label="Exportar Reportes"
                    variant="secondary"
                    icon="csv"
                    disabled={!kpis}
                    className="w-full justify-center"
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Excel (Verde):</span> Incluye 6 hojas con datos del sistema
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    <span className="font-semibold">CSV (Azul):</span> Solo reportes de inspección
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contenido Principal */}
          <div className="flex-1 min-w-0">
        {/* KPIs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <KPICard
            title="Reportes Hoy"
            value={kpis?.total_reportes_hoy || 0}
            subtitle={`${kpis?.total_reportes_semana || 0} esta semana`}
            icon={BarChart3}
            clickable={true}
            onClick={() => router.push('/dashboard/reportes')}
          />
          <KPICard
            title="Reportes con Problemas"
            value={kpis?.reportes_con_problemas || 0}
            subtitle={`${kpis?.porcentaje_con_problemas || 0}% del total`}
            icon={AlertTriangle}
            clickable={true}
            onClick={() => router.push('/dashboard/reportes?problemas=true')}
          />
        </div>

        {/* Gráfico de Tendencia */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tendencia Diaria (30 días)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={tendenciaDataset}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="score_promedio" stroke="#3b82f6" name="Score Promedio" />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="porcentaje_problemas"
                stroke="#f97316"
                strokeDasharray="5 5"
                dot={false}
                name="% con Problemas"
              />
              <Line yAxisId="right" type="monotone" dataKey="total_inspecciones" stroke="#10b981" name="Inspecciones" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bloques comparativos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Top Grúas Problemáticas */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Top 10 Grúas con Más Problemas (30 días)</h2>
              {topGruas.length > 5 && (
                <button
                  onClick={() => setMostrarTodasGruasProblematicas(!mostrarTodasGruasProblematicas)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
                >
                  {mostrarTodasGruasProblematicas ? 'Ver menos' : `Ver todas (${topGruas.length})`}
                </button>
              )}
            </div>
            <div className={`space-y-3 ${mostrarTodasGruasProblematicas ? 'max-h-[400px] overflow-y-auto pr-2' : ''}`}>
              {topGruas.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No hay datos suficientes</p>
              ) : (
                gruasProblematicasMostradas.map((grua, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center">
                      <Forklift className="w-5 h-5 text-gray-400 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">{String(grua.activo_nombre)}</p>
                        <p className="text-sm text-gray-500">{String(grua.total_reportes)} reportes</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{String(grua.reportes_con_problemas)} Reportes con Problemas</p>
                      <p className="text-sm text-gray-500">{Number(grua.porcentaje_problemas)}%</p>
                      <button
                        onClick={() => {
                          const activoId = grua.activo_id ?? grua.id
                          if (activoId) {
                            router.push(`/dashboard/reportes?activo=${activoId}&problemas=true`)
                          }
                        }}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
                      >
                        Ver reportes
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Uso de Grúas */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Uso de Grúas (30 días)</h2>
              {topUso.length > 5 && (
                <button
                  onClick={() => setMostrarTodasGruas(!mostrarTodasGruas)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
                >
                  {mostrarTodasGruas ? 'Ver menos' : `Ver todas (${topUso.length})`}
                </button>
              )}
            </div>
            <div className={`space-y-3 ${mostrarTodasGruas ? 'max-h-[400px] overflow-y-auto pr-2' : ''}`}>
              {topUso.length === 0 ? (
                <p className="text-center py-8 text-gray-500">Aún no hay datos de uso registrados</p>
              ) : (
                gruasMostradas.map((item, idx) => (
                  <div key={item.activoId} className="p-3 bg-gray-50 rounded">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {idx + 1}. {item.nombre}
                        </p>
                        <p className="text-xs text-gray-500">Inspecciones 30d: {item.inspecciones30}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {item.horasUso30.toLocaleString('es-CL', { minimumFractionDigits: 1 })} h
                        </p>
                        <p className="text-xs text-gray-500">
                          Últimos 7 días: {item.horasUso7.toLocaleString('es-CL', { minimumFractionDigits: 1 })} h
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/reportes?activo=${item.activoId}`)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
                    >
                      Ver reportes
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Análisis por Turno */}
        <div className="bg-white rounded-lg shadow p-6 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Análisis por Turno (30 días)</h2>
            <button
              onClick={() => router.push('/dashboard/reportes?problemas=true')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
            >
              Ver reportes con problemas →
            </button>
          </div>
          {turnos && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((turno) => {
                const data = turnos?.[`turno_${turno}`] as Record<string, unknown> | undefined
                if (!data) return null
                return (
                  <div key={turno} className="p-4 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">Turno {turno}</h3>
                      <span className="text-sm text-gray-500">{String(data.total_inspecciones)} inspecciones</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500 mb-1">Score</p>
                        <p className="font-semibold">{String(data.score_promedio)}%</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1 leading-tight">Reportes con Problemas</p>
                        <p className="font-semibold text-red-600">{String(data.con_problemas)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Horas Uso</p>
                        <p className="font-semibold">{String(data.horas_uso)}h</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* Top Problemas */}
        <div className="bg-white rounded-lg shadow p-6 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Top 10 Problemas Más Frecuentes (30 días)</h2>
            <button
              onClick={() => router.push('/dashboard/problemas-criticos')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer hover:underline"
            >
              Ver análisis completo →
            </button>
          </div>
          <div className="space-y-2">
            {topProblemas.length === 0 ? (
              <p className="text-center py-8 text-gray-500">No hay problemas detectados</p>
            ) : (
              topProblemas.map((problema, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded">
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{String(problema.texto_pregunta)}</p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <span className="text-sm text-gray-500">{String(problema.total_fallo)} fallos</span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${Number(problema.porcentaje_fallo)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-red-600 w-12 text-right">
                      {Number(problema.porcentaje_fallo)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

          </div>

          {/* Sidebar de Reportes Recientes */}
          <div className="hidden xl:block w-80 flex-shrink-0">
            <ReportesRecientesSidebar
              reportes={reportesRecientes}
              loading={loading}
              actualizando={actualizando}
            />
          </div>
        </div>

        {/* Footer con Créditos */}
        <footer className="mt-12 pb-8">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="border-t border-gray-200 pt-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-xs text-gray-500">
                    InspectaPro – Demo · Datos ficticios con fines de portafolio.
                  </p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-gray-400">Desarrollado por</p>
                  <p className="text-sm font-medium text-gray-600">Andrés Amaya Garcés</p>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Menú Móvil Lateral */}
      {menuMovilAbierto && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity"
            onClick={() => setMenuMovilAbierto(false)}
          />

          {/* Sidebar Menú */}
          <div className="fixed top-0 right-0 bottom-0 w-80 bg-white shadow-2xl z-50 lg:hidden transform transition-transform duration-300 ease-in-out">
            {/* Header del Menú */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="text-lg font-bold text-white">Navegación</h2>
              <button
                onClick={() => setMenuMovilAbierto(false)}
                className="p-2 text-white hover:bg-white/20 rounded-md transition-colors"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Links de Navegación */}
            <nav className="flex flex-col p-4 space-y-3">
              <button
                onClick={() => {
                  navegarA('/dashboard/gruas')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/gruas' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <Forklift className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Gestión Grúas</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/reportes')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/reportes' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <FileText className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Reportes</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/heatmap')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/heatmap' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <BarChart3 className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Heatmap</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/horometros')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/horometros' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <Timer className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Horómetros</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/operadores')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/operadores' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <Users className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Operadores</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/problemas-criticos')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/problemas-criticos' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <AlertTriangle className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Problemas Críticos</span>
              </button>

              <button
                onClick={() => {
                  navegarA('/dashboard/notificaciones')
                  setMenuMovilAbierto(false)
                }}
                disabled={navegando !== null}
                className="flex items-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {navegando === '/dashboard/notificaciones' ? (
                  <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <Settings className="w-5 h-5 mr-3" />
                )}
                <span className="font-medium">Configuración</span>
              </button>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setMenuMovilAbierto(false)
                    handleLogout()
                  }}
                  className="w-full flex items-center px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                >
                  <span className="font-medium">Cerrar Sesión</span>
                </button>
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}





