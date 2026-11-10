'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  TrendingUp,
  AlertTriangle,
  Clock,
  Activity,
  Gauge,
  Users,
  RefreshCw
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import {
  obtenerCorrelacionHorometroProblemas,
  obtenerEficienciaHorometro,
  obtenerEstadoHorometros,
  CorrelacionHorometro,
  EficienciaHorometro,
  EstadoHorometro
} from '@/lib/horometros-service'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Cell } from 'recharts'
import { obtenerOperadoresHorometrosPendientes, OperadorHorometroPendiente } from '@/lib/horometros-service'
import { supabase } from '@/lib/supabase'
import ExportButton from '@/components/ExportButton'
import {
  exportarAExcel,
  exportarACSV,
  exportarAExcelMultiplesHojas,
  generarNombreArchivo,
  formatearFechaExcel,
  formatearPorcentaje
} from '@/lib/export-utils'

export default function HorometrosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [correlacion, setCorrelacion] = useState<CorrelacionHorometro[]>([])
  const [eficiencia, setEficiencia] = useState<EficienciaHorometro[]>([])
  const [estado, setEstado] = useState<EstadoHorometro[]>([])
  const [dias, setDias] = useState(90)
  const [operadoresPendientes, setOperadoresPendientes] = useState<OperadorHorometroPendiente[]>([])
  const [usuario, setUsuario] = useState<{ rol: string } | null>(null)

  // Carga los cuatro datasets de horómetros en paralelo; silencioso=true solo activa spinner secundario
  const cargarDatos = useCallback(async (silencioso: boolean = false) => {
    if (!silencioso) {
      setLoading(true)
    } else {
      setActualizando(true)
    }

    try {
      // Carga paralela: correlación, eficiencia, estado actual y operadores pendientes
      const [correlacionData, eficienciaData, estadoData, pendientesData] = await Promise.all([
          obtenerCorrelacionHorometroProblemas(dias),
          obtenerEficienciaHorometro(dias),
          obtenerEstadoHorometros(),
          obtenerOperadoresHorometrosPendientes()
      ])

      setCorrelacion(correlacionData)
      setEficiencia(eficienciaData)
      setEstado(estadoData)
      setOperadoresPendientes(pendientesData)
    } catch (error) {
      console.error('Error cargando datos de horómetros:', error)
    } finally {
      if (!silencioso) {
        setLoading(false)
      } else {
        setActualizando(false)
      }
    }
  }, [dias])

  const checkAuthAndLoad = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    setUsuario(user)
    await cargarDatos()
  }, [router, cargarDatos])

  // Verificar autenticación al montar
  useEffect(() => {
    checkAuthAndLoad()
  }, [checkAuthAndLoad])

  // Recargar datos cuando cambia el período (excluyendo la primera carga)
  useEffect(() => {
    // Solo ejecutar cuando dias cambie, no en el primer render
    const isFirstRender = correlacion.length === 0 && loading
    if (!isFirstRender) {
      cargarDatos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  // ========================================
  // REALTIME SUBSCRIPTION para horómetros pendientes
  // ========================================
  useEffect(() => {
    if (!usuario) return

    console.log('[Horómetros] Conectando a Realtime...')

    const channel = supabase
      .channel('horometros-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reportes_inspeccion'
        },
        (payload) => {
          console.log('[Horómetros] Nuevo reporte detectado:', payload.new)
          cargarDatos(true) // Actualización silenciosa
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
          console.log('[Horómetros] Reporte actualizado:', payload.new)
          cargarDatos(true)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Horómetros] Conectado a Realtime')
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Horómetros] Error en canal Realtime')
        }
      })

    return () => {
      console.log('[Horómetros] Desconectando Realtime...')
      supabase.removeChannel(channel)
    }
  }, [usuario, cargarDatos])

  // Funciones de exportación
  function exportarOperadoresPendientesExcel() {
    if (operadoresPendientes.length === 0) {
      alert('No hay operadores pendientes para exportar')
      return
    }

    const datosExport = operadoresPendientes.flatMap(operador =>
      operador.reportes_pendientes.map(reporte => {
        const diasPendiente = Math.floor(reporte.dias_pendiente)
        const esUrgente = diasPendiente > 2

        return {
          'Operador': operador.usuario_nombre,
          'RUT Operador': operador.usuario_rut || '-',
          'Total Pendientes': operador.total_pendientes,
          'Grúa': reporte.activo_nombre,
          'Turno': `Turno ${reporte.turno}`,
          'Fecha/Hora Inicio': formatearFechaExcel(reporte.timestamp_inicio),
          'Fecha/Hora Completado': formatearFechaExcel(reporte.timestamp_completado),
          'Horómetro Inicial': reporte.horometro_inicial ? `${reporte.horometro_inicial}h` : '-',
          'Días Pendiente': diasPendiente,
          'Estado': esUrgente ? 'URGENTE' : 'Pendiente'
        }
      })
    )

    const nombreArchivo = generarNombreArchivo('operadores_horometros_pendientes', 'xlsx')
    exportarAExcel(datosExport, nombreArchivo, 'Pendientes')
  }

  function exportarOperadoresPendientesCSV() {
    if (operadoresPendientes.length === 0) {
      alert('No hay operadores pendientes para exportar')
      return
    }

    const datosExport = operadoresPendientes.flatMap(operador =>
      operador.reportes_pendientes.map(reporte => {
        const diasPendiente = Math.floor(reporte.dias_pendiente)
        const esUrgente = diasPendiente > 2

        return {
          'Operador': operador.usuario_nombre,
          'RUT Operador': operador.usuario_rut || '-',
          'Total Pendientes': operador.total_pendientes,
          'Grúa': reporte.activo_nombre,
          'Turno': `Turno ${reporte.turno}`,
          'Fecha/Hora Inicio': formatearFechaExcel(reporte.timestamp_inicio),
          'Fecha/Hora Completado': formatearFechaExcel(reporte.timestamp_completado),
          'Horómetro Inicial': reporte.horometro_inicial ? `${reporte.horometro_inicial}h` : '-',
          'Días Pendiente': diasPendiente,
          'Estado': esUrgente ? 'URGENTE' : 'Pendiente'
        }
      })
    )

    const nombreArchivo = generarNombreArchivo('operadores_horometros_pendientes', 'csv')
    exportarACSV(datosExport, nombreArchivo)
  }

  function exportarAnalisisCompletoExcel() {
    // Hoja 1: Correlación Horómetro-Problemas
    // Campos según Supabase: activo_nombre, total_horas_uso_registradas, total_horas_uso_omitidas,
    // total_horas_uso, total_inspecciones, inspecciones_con_problemas, porcentaje_problemas, promedio_horas_por_inspeccion
    const datosCorrelacion = correlacion.map(c => {
      const horasRegistradas = parseFloat(c.total_horas_uso_registradas?.toString() || '0')
      const horasOmitidas = parseFloat(c.total_horas_uso_omitidas?.toString() || '0')
      const horasTotal = parseFloat(c.total_horas_uso?.toString() || '0')

      return {
        'Grúa': c.activo_nombre,
        'Total Horas Uso': horasTotal.toFixed(2),
        'Horas Registradas': horasRegistradas.toFixed(2),
        'Horas Omitidas': horasOmitidas.toFixed(2),
        '% Horas Omitidas': horasTotal > 0
          ? formatearPorcentaje((horasOmitidas / horasTotal) * 100, 1)
          : '0%',
        'Total Inspecciones': c.total_inspecciones || 0,
        'Inspecciones con Problemas': c.inspecciones_con_problemas || 0,
        '% Problemas': formatearPorcentaje(parseFloat(c.porcentaje_problemas?.toString() || '0'), 1),
        'Promedio Horas/Inspección': parseFloat(c.promedio_horas_por_inspeccion?.toString() || '0').toFixed(2)
      }
    })

    // Hoja 2: Eficiencia de Uso
    // Campos según Supabase: activo_nombre, dias_periodo, horas_uso_registradas, horas_uso_omitidas,
    // horas_uso_total, horas_disponibles_teoricas, porcentaje_utilizacion, promedio_horas_dia,
    // reportes_con_horometro, reportes_sin_horometro
    const datosEficiencia = eficiencia.map(e => {
      const totalReportes = (e.reportes_con_horometro || 0) + (e.reportes_sin_horometro || 0)
      const porcentajeCompletitud = totalReportes > 0
        ? ((e.reportes_con_horometro || 0) / totalReportes * 100)
        : 0

      return {
        'Grúa': e.activo_nombre,
        'Días Período': e.dias_periodo || 0,
        'Reportes con Horómetro': e.reportes_con_horometro || 0,
        'Reportes sin Horómetro': e.reportes_sin_horometro || 0,
        'Total Reportes': totalReportes,
        '% Completitud Registro': formatearPorcentaje(porcentajeCompletitud, 1),
        'Horas Uso Registradas': parseFloat(e.horas_uso_registradas?.toString() || '0').toFixed(2),
        'Horas Uso Omitidas': parseFloat(e.horas_uso_omitidas?.toString() || '0').toFixed(2),
        'Horas Uso Total': parseFloat(e.horas_uso_total?.toString() || '0').toFixed(2),
        'Horas Disponibles Teóricas': parseFloat(e.horas_disponibles_teoricas?.toString() || '0').toFixed(2),
        '% Utilización': formatearPorcentaje(parseFloat(e.porcentaje_utilizacion?.toString() || '0'), 1),
        'Promedio Horas/Día': parseFloat(e.promedio_horas_dia?.toString() || '0').toFixed(2)
      }
    })

    // Hoja 3: Estado Actual
    // Campos según Supabase: activo_nombre, horometro_actual, fecha_ultimo_reporte,
    // dias_sin_actualizacion, ultima_grua_operativa
    const datosEstado = estado.map(e => ({
      'Grúa': e.activo_nombre,
      'Horómetro Actual (h)': e.horometro_actual || 'N/A',
      'Fecha Último Reporte': e.fecha_ultimo_reporte
        ? formatearFechaExcel(e.fecha_ultimo_reporte)
        : 'Sin reportes',
      'Días Sin Actualización': e.dias_sin_actualizacion ?? 'N/A',
      'Estado Operativo': e.ultima_grua_operativa ? 'Operativa' : 'Inactiva'
    }))

    const hojas = [
      { nombre: 'Correlación', datos: datosCorrelacion },
      { nombre: 'Eficiencia', datos: datosEficiencia },
      { nombre: 'Estado Actual', datos: datosEstado }
    ]

    const nombreArchivo = generarNombreArchivo('analisis_horometros_completo', 'xlsx')
    exportarAExcelMultiplesHojas(hojas, nombreArchivo)
  }

  function exportarCorrelacionCSV() {
    if (correlacion.length === 0) {
      alert('No hay datos de correlación para exportar')
      return
    }

    const datosExport = correlacion.map(c => {
      const horasRegistradas = parseFloat(c.total_horas_uso_registradas?.toString() || '0')
      const horasOmitidas = parseFloat(c.total_horas_uso_omitidas?.toString() || '0')
      const horasTotal = parseFloat(c.total_horas_uso?.toString() || '0')

      return {
        'Grúa': c.activo_nombre,
        'Total Horas Uso': horasTotal.toFixed(2),
        'Horas Registradas': horasRegistradas.toFixed(2),
        'Horas Omitidas': horasOmitidas.toFixed(2),
        '% Horas Omitidas': horasTotal > 0
          ? formatearPorcentaje((horasOmitidas / horasTotal) * 100, 1)
          : '0%',
        'Total Inspecciones': c.total_inspecciones || 0,
        'Inspecciones con Problemas': c.inspecciones_con_problemas || 0,
        '% Problemas': formatearPorcentaje(parseFloat(c.porcentaje_problemas?.toString() || '0'), 1),
        'Promedio Horas/Inspección': parseFloat(c.promedio_horas_por_inspeccion?.toString() || '0').toFixed(2)
      }
    })

    const nombreArchivo = generarNombreArchivo('correlacion_horometros', 'csv')
    exportarACSV(datosExport, nombreArchivo)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando análisis...</p>
        </div>
      </div>
    )
  }

  // Preparar datos para gráfico de correlación
  const dataCorrelacion = correlacion
  .sort((a, b) => a.activo_nombre.localeCompare(b.activo_nombre))
  .map(c => ({
    nombre: c.activo_nombre,
    horas: c.total_horas_uso,
    horasRegistradas: c.total_horas_uso_registradas,
    horasOmitidas: c.total_horas_uso_omitidas,
    problemas: c.porcentaje_problemas
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Análisis de Horómetros</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600">Uso, eficiencia y correlación con problemas</p>
                {actualizando && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Actualizando...
                  </span>
                )}
              </div>
            </div>

            {/* Selector de período y Exportación */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Período:</label>
              <select
                value={dias}
                onChange={(e) => setDias(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="30">Últimos 30 días</option>
                <option value="60">Últimos 60 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="180">Últimos 6 meses</option>
              </select>

              {/* Botones de Exportación */}
              <ExportButton
                onExport={exportarAnalisisCompletoExcel}
                label="Exportar Completo"
                variant="primary"
                icon="excel"
                disabled={correlacion.length === 0}
              />
              <ExportButton
                onExport={exportarCorrelacionCSV}
                label="Exportar CSV"
                variant="secondary"
                icon="csv"
                disabled={correlacion.length === 0}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Estado Actual de Horómetros */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Estado Actual de Horómetros</h2>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grúa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horómetro Actual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Última Actualización</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Días Sin Datos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {estado.map((item) => {
                  const alerta = item.dias_sin_actualizacion > 7
                  
                  return (
                    <tr key={item.activo_id} className={alerta ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.activo_nombre}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.horometro_actual ? `${item.horometro_actual}h` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.fecha_ultimo_reporte 
                          ? new Date(item.fecha_ultimo_reporte).toLocaleDateString('es-CL')
                          : 'Sin reportes'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${alerta ? 'text-yellow-700' : 'text-gray-600'}`}>
                          {item.dias_sin_actualizacion ?? '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.ultima_grua_operativa 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {item.ultima_grua_operativa ? 'Operativa' : 'Inactiva'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Operadores con Horómetros Pendientes */}
        <div id="pendientes" className="bg-white rounded-lg shadow scroll-mt-8">
        <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                Operadores con Horómetros Pendientes
                </h2>
            </div>
            <span className="text-2xl font-bold text-orange-600">
                {operadoresPendientes.reduce((acc, op) => acc + op.total_pendientes, 0)}
            </span>
            </div>
        </div>
        
        <div className="p-6">
            {operadoresPendientes.length === 0 ? (
                <div className="text-center py-8 text-green-600">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">¡Excelente! No hay horómetros pendientes</p>
                </div>
            ) : (
            <div className="space-y-4">
                {operadoresPendientes.map((operador) => (
                <div 
                    key={operador.usuario_id} 
                    className="border border-orange-200 rounded-lg bg-orange-50 p-4"
                >
                    <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-gray-900">
                        {operador.usuario_nombre}
                        </h3>
                        <p className="text-sm text-gray-600">RUT: {operador.usuario_rut}</p>
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-600 text-white">
                        {operador.total_pendientes} pendiente{operador.total_pendientes !== 1 ? 's' : ''}
                    </span>
                    </div>

                    <div className="space-y-2">
                    {operador.reportes_pendientes.map((reporte) => {
                        const diasPendiente = Math.floor(reporte.dias_pendiente)
                        const esUrgente = diasPendiente > 2
                        
                        return (
                        <div 
                            key={reporte.reporte_id}
                            className={`flex items-center justify-between p-3 rounded-md ${
                            esUrgente ? 'bg-red-100 border border-red-300' : 'bg-white border border-gray-200'
                            }`}
                        >
                            <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                {reporte.activo_nombre}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                Turno {reporte.turno}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                                Inicio: {new Date(reporte.timestamp_inicio).toLocaleDateString('es-CL')} {new Date(reporte.timestamp_inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                {reporte.horometro_inicial && (
                                <span className="ml-3">
                                    Horómetro inicial: <span className="font-medium">{reporte.horometro_inicial}h</span>
                                </span>
                                )}
                            </div>
                            </div>
                            <div className="text-right ml-4">
                            <div className={`text-sm font-semibold ${esUrgente ? 'text-red-700' : 'text-orange-700'}`}>
                                {diasPendiente} día{diasPendiente !== 1 ? 's' : ''}
                            </div>
                            <div className="text-xs text-gray-500">pendiente</div>
                            </div>
                        </div>
                        )
                    })}
                    </div>
                </div>
                ))}
            </div>
            )}
        </div>
        </div>

        {/* Correlación: Horas Uso vs Problemas */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Correlación: Horas de Uso vs Problemas Detectados
            </h2>
          </div>
          
          {correlacion.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay datos suficientes para mostrar correlación
            </div>
          ) : (
            <>
              {/* Scatter Plot */}
              <div className="mt-6 overflow-x-auto">
                <div style={{ minWidth: '600px' }}>
                  <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart
                      margin={{ top: 20, right: 20, bottom: 60, left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        type="number" 
                        dataKey="horas" 
                        name="Horas de Uso"
                        label={{ 
                          value: 'Horas de Uso Total', 
                          position: 'insideBottom', 
                          offset: -10,
                          style: { fontSize: 14, fontWeight: 600 }
                        }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="problemas" 
                        name="% Problemas"
                        label={{ 
                          value: '% Problemas', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { fontSize: 14, fontWeight: 600 }
                        }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                                <p className="font-semibold text-gray-900">{data.nombre}</p>
                                <div className="mt-2 space-y-1">
                                  <p className="text-sm text-gray-600">
                                    Horas registradas: <span className="font-medium text-blue-600">{data.horasRegistradas}h</span>
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    Horas omitidas: <span className="font-medium text-orange-600">{data.horasOmitidas}h</span>
                                  </p>
                                  <p className="text-sm text-gray-600 border-t pt-1">
                                    Total: <span className="font-semibold text-blue-600">{data.horas}h</span>
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    % Problemas: <span className="font-medium text-red-600">{data.problemas}%</span>
                                  </p>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Scatter 
                        name="Grúas" 
                        data={dataCorrelacion} 
                        fill="#8884d8"
                      >
                        {dataCorrelacion.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={
                              entry.problemas > 25 ? '#ef4444' :  // Rojo: >25% problemas
                              entry.problemas > 15 ? '#f59e0b' :  // Naranja: >15% problemas
                              '#10b981'  // Verde: ≤15% problemas
                            }
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Leyenda de colores */}
              <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">Bajo (&lt;15% problemas)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-gray-600">Medio (15-25%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-gray-600">Alto (&gt;25%)</span>
                </div>
              </div>

              {/* Interpretación de la correlación */}
              <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Activity className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-purple-900 mb-1">
                      Interpretación de la Correlación
                    </h3>
                    <p className="text-sm text-purple-700">
                      Si los puntos forman una línea diagonal ascendente, existe correlación positiva 
                      (más horas de uso = más problemas). Si están dispersos sin patrón, la correlación es baja 
                      y los problemas pueden deberse a otros factores como mantenimiento o condiciones de operación.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabla detallada debajo */}
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grúa</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Horas Registradas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Horas Omitidas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Horas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inspecciones</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Con Problemas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Problemas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Promedio h/insp</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {correlacion
                      .sort((a, b) => a.activo_nombre.localeCompare(b.activo_nombre))
                      .map((item) => (
                        <tr key={item.activo_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.activo_nombre}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600">
                            {item.total_horas_uso_registradas}h
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-orange-600">
                            {item.total_horas_uso_omitidas}h
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-blue-600">
                            {item.total_horas_uso}h
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                            {item.total_inspecciones}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600">
                            {item.inspecciones_con_problemas}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            <span className={`font-semibold ${
                              item.porcentaje_problemas < 15 ? 'text-green-600' :
                              item.porcentaje_problemas < 25 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {item.porcentaje_problemas}%
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                            {item.promedio_horas_por_inspeccion}h
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Eficiencia: Horómetro vs Tiempo Calendario */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Eficiencia: Utilización vs Tiempo Disponible
            </h2>
          </div>

          {eficiencia.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay datos suficientes para mostrar eficiencia
            </div>
          ) : (
            <div className="space-y-4">
              {eficiencia.map((item) => (
                <div key={item.activo_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{item.activo_nombre}</h3>
                    <span className={`text-2xl font-bold ${
                      item.porcentaje_utilizacion > 50 ? 'text-green-600' :
                      item.porcentaje_utilizacion > 25 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {item.porcentaje_utilizacion}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Horas Registradas</p>
                      <p className="font-semibold text-blue-600">{item.horas_uso_registradas}h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Horas Omitidas</p>
                      <p className="font-semibold text-orange-600">{item.horas_uso_omitidas}h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Horas Uso</p>
                      <p className="font-semibold text-gray-900">{item.horas_uso_total}h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Horas Disponibles</p>
                      <p className="font-semibold text-gray-900">{item.horas_disponibles_teoricas}h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Promedio h/día</p>
                      <p className="font-semibold text-gray-900">{item.promedio_horas_dia}h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Período</p>
                      <p className="font-semibold text-gray-900">{item.dias_periodo} días</p>
                    </div>
                  </div>

                  {/* Indicador de reportes */}
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span>{item.reportes_con_horometro} reportes con horómetro</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span>{item.reportes_sin_horometro} reportes omitidos</span>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          item.porcentaje_utilizacion > 50 ? 'bg-green-500' :
                          item.porcentaje_utilizacion > 25 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(item.porcentaje_utilizacion, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Insights y Recomendaciones</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Grúas con alta utilización (&gt;50%) requieren monitoreo más frecuente</li>
                <li>• Grúas con baja utilización (&lt;25%) pueden indicar subutilización o problemas operacionales</li>
                <li>• Mayor cantidad de horas no siempre correlaciona con más problemas - depende del mantenimiento</li>
                <li>• Grúas sin actualización de horómetro por más de 7 días requieren atención</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}