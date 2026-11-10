'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Camera,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import {
  obtenerAnalisisProblemasCriticos,
  obtenerEvolucionProblema,
  obtenerActivosAfectadosPorProblema,
  obtenerTopGruasProblematicas,
  obtenerCorrelacionUsoProblemas,
  ProblemaCritico,
  EvolucionProblema,
  ActivoAfectado
} from '@/lib/problemas-criticos-service'
import ExportButton from '@/components/ExportButton'
import {
  exportarACSV,
  exportarAExcelMultiplesHojas,
  generarNombreArchivo,
  formatearFechaExcel
} from '@/lib/export-utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function ProblemasCriticosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [problemas, setProblemas] = useState<ProblemaCritico[]>([])
  const [problemaSeleccionado, setProblemaSeleccionado] = useState<number | null>(null)
  const [evolucion, setEvolucion] = useState<EvolucionProblema[]>([])
  const [activosAfectados, setActivosAfectados] = useState<ActivoAfectado[]>([])
  const [dias, setDias] = useState(30)
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'CRITICA' | 'ALTA' | 'MEDIA'>('TODOS')
  const [filtroTendencia, setFiltroTendencia] = useState<'TODOS' | 'EMPEORANDO' | 'MEJORANDO' | 'ESTABLE'>('TODOS')

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const data = await obtenerAnalisisProblemasCriticos(dias)
    setProblemas(data)
    setLoading(false)
  }, [dias])

  const checkAuthAndLoad = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    await cargarDatos()
  }, [router, cargarDatos])

  // Verificar autenticación al montar
  useEffect(() => {
    checkAuthAndLoad()
  }, [checkAuthAndLoad])

  // Recargar datos cuando cambia el período (excluyendo la primera carga)
  useEffect(() => {
    // Solo ejecutar cuando dias cambie, no en el primer render
    const isFirstRender = problemas.length === 0 && loading
    if (!isFirstRender) {
      cargarDatos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  // Toggle de drilldown: al hacer clic en un problema carga evolución + activos afectados en paralelo;
  // un segundo clic sobre el mismo cierra el panel de detalle
  async function seleccionarProblema(preguntaId: number) {
    if (problemaSeleccionado === preguntaId) {
      // Si ya está seleccionado, deseleccionar
      setProblemaSeleccionado(null)
      setEvolucion([])
      setActivosAfectados([])
    } else {
      setProblemaSeleccionado(preguntaId)

      // Cargar datos detallados
      const [evolucionData, activosData] = await Promise.all([
        obtenerEvolucionProblema(preguntaId, 90),
        obtenerActivosAfectadosPorProblema(preguntaId, dias)
      ])
      
      setEvolucion(evolucionData)
      setActivosAfectados(activosData)
    }
  }

  // Filtrar problemas
  const problemasFiltrados = problemas.filter(p => {
    if (filtroEstado !== 'TODOS' && p.criticidad !== filtroEstado) return false
    if (filtroTendencia !== 'TODOS' && p.tendencia !== filtroTendencia) return false
    return true
  })

  // Estadísticas generales
  const totalProblemas = problemas.length
  const problemasCriticos = problemas.filter(p => p.criticidad === 'CRITICA').length
  const problemasEmpeorando = problemas.filter(p => p.tendencia === 'EMPEORANDO').length
  const activosConProblemas = new Set(problemas.flatMap(p => p.afecta_activos)).size

  // Funciones de exportación
  async function exportarAnalisisCompleto() {
    if (problemasFiltrados.length === 0) {
      alert('No hay problemas para exportar')
      return
    }

    // Obtener datos adicionales
    const [gruasProblematicas, correlacionUso] = await Promise.all([
      obtenerTopGruasProblematicas(50, dias),
      obtenerCorrelacionUsoProblemas(dias)
    ])

    // Obtener grúas afectadas para todos los problemas
    const gruasAfectadasPromises = problemasFiltrados.map(p =>
      obtenerActivosAfectadosPorProblema(p.pregunta_id, dias)
    )
    const gruasAfectadasArrays = await Promise.all(gruasAfectadasPromises)

    // HOJA 1: Problemas Detectados
    const datosProblemasCriticos = problemasFiltrados.map(p => ({
      'Item/Pregunta': p.texto_pregunta,
      'Total Evaluaciones': p.total_evaluaciones,
      'Total Fallos': p.total_fallos,
      '% Fallo': p.porcentaje_fallo,
      'Grúas Afectadas': p.afecta_activos,
      'Fotos Evidencia': p.fotos_evidencia,
      'Última Ocurrencia': formatearFechaExcel(p.ultima_ocurrencia)
    }))

    // HOJA 2: Detalle Grúas Afectadas por Problema
    const datosGruasAfectadas: Array<Record<string, unknown>> = []
    problemasFiltrados.forEach((problema, index) => {
      const afectadas = gruasAfectadasArrays[index] || []
      afectadas.forEach(activo => {
        datosGruasAfectadas.push({
          'ID Pregunta': problema.pregunta_id,
          'Problema/Item': problema.texto_pregunta,
          'ID Grúa': activo.activo_id,
          'Grúa': activo.activo_nombre,
          'Evaluaciones': activo.total_evaluaciones,
          'Fallos': activo.total_fallos,
          '% Fallo': activo.porcentaje_fallo,
          'Última Ocurrencia': formatearFechaExcel(activo.ultima_ocurrencia)
        })
      })
    })

    // HOJA 3: Grúas con Problemas
    const datosRankingGruas = gruasProblematicas.map(grua => ({
      'ID Grúa': grua.activo_id,
      'Grúa': grua.activo_nombre,
      'Total Reportes': grua.total_reportes,
      'Reportes con Problemas': grua.reportes_con_problemas,
      '% Reportes con Problemas': grua.porcentaje_problemas,
      'Score Promedio': grua.score_promedio
    }))

    // HOJA 4: Uso y Problemas por Grúa
    const datosCorrelacion = correlacionUso.map(c => ({
      'ID Grúa': c.activo_id,
      'Grúa': c.activo_nombre,
      'Horas Operación Registradas': c.total_horas_uso_registradas,
      'Horas Operación Omitidas': c.total_horas_uso_omitidas,
      'Total Horas Operación': c.total_horas_uso,
      'Total Inspecciones': c.total_inspecciones,
      'Inspecciones con Problemas': c.inspecciones_con_problemas,
      '% Problemas': c.porcentaje_problemas,
      'Promedio Horas Operación entre Inspecciones': c.promedio_horas_por_inspeccion
    }))

    // Exportar Excel multi-hoja
    const hojas = [
      { nombre: 'Problemas', datos: datosProblemasCriticos },
      { nombre: 'Detalle por Grúa', datos: datosGruasAfectadas.length > 0 ? datosGruasAfectadas : [{ 'Info': 'No hay datos disponibles' }] },
      { nombre: 'Grúas Problemáticas', datos: datosRankingGruas },
      { nombre: 'Uso y Problemas', datos: datosCorrelacion.length > 0 ? datosCorrelacion : [{ 'Info': 'No hay datos disponibles' }] }
    ]

    const nombreArchivo = generarNombreArchivo('problemas_criticos', 'xlsx')
    exportarAExcelMultiplesHojas(hojas, nombreArchivo)
  }

  async function exportarProblemasCSV() {
    if (problemasFiltrados.length === 0) {
      alert('No hay problemas para exportar')
      return
    }

    const datosExport = problemasFiltrados.map(p => ({
      'ID Pregunta': p.pregunta_id,
      'Item/Pregunta': p.texto_pregunta,
      'Total Evaluaciones': p.total_evaluaciones,
      'Total Fallos': p.total_fallos,
      '% Fallo': p.porcentaje_fallo,
      'Cantidad Grúas Afectadas': p.afecta_activos,
      'Fotos Evidencia': p.fotos_evidencia,
      'Última Ocurrencia': formatearFechaExcel(p.ultima_ocurrencia)
    }))

    const nombreArchivo = generarNombreArchivo('problemas', 'csv')
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
              <h1 className="text-2xl font-bold text-gray-900">Análisis de Problemas Críticos</h1>
              <p className="text-sm text-gray-600">Identificación y seguimiento de fallas recurrentes</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Selector de período */}
              <label className="text-sm font-medium text-gray-700">Período:</label>
              <select
                value={dias}
                onChange={(e) => setDias(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="7">Últimos 7 días</option>
                <option value="15">Últimos 15 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="60">Últimos 60 días</option>
                <option value="90">Últimos 90 días</option>
              </select>

              {/* Botones de exportación */}
              <ExportButton
                onExport={exportarAnalisisCompleto}
                label="Exportar a Excel"
                variant="primary"
                icon="excel"
                disabled={problemasFiltrados.length === 0}
              />
              <ExportButton
                onExport={exportarProblemasCSV}
                label="Exportar a CSV"
                variant="secondary"
                icon="csv"
                disabled={problemasFiltrados.length === 0}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPIs Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Problemas</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{totalProblemas}</p>
              </div>
              <div className="bg-blue-50 rounded-full p-3">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Críticos</p>
                <p className="mt-2 text-3xl font-bold text-red-600">{problemasCriticos}</p>
                <p className="text-xs text-gray-500 mt-1">≥50% de falla</p>
              </div>
              <div className="bg-red-50 rounded-full p-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Empeorando</p>
                <p className="mt-2 text-3xl font-bold text-orange-600">{problemasEmpeorando}</p>
                <p className="text-xs text-gray-500 mt-1">Tendencia negativa</p>
              </div>
              <div className="bg-orange-50 rounded-full p-3">
                <TrendingDown className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos Afectados</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{activosConProblemas}</p>
              </div>
              <div className="bg-purple-50 rounded-full p-3">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Criticidad
              </label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as "CRITICA" | "ALTA" | "MEDIA" | "TODOS")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="TODOS">Todos los niveles</option>
                <option value="CRITICA">🔴 Crítica (≥50%)</option>
                <option value="ALTA">🟠 Alta (30-49%)</option>
                <option value="MEDIA">🟡 Media (15-29%)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tendencia
              </label>
              <select
                value={filtroTendencia}
                onChange={(e) => setFiltroTendencia(e.target.value as "EMPEORANDO" | "MEJORANDO" | "ESTABLE" | "TODOS")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="TODOS">Todas las tendencias</option>
                <option value="EMPEORANDO">📉 Empeorando</option>
                <option value="ESTABLE">➡️ Estable</option>
                <option value="MEJORANDO">📈 Mejorando</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Problemas */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Problemas Detectados ({problemasFiltrados.length})
            </h2>
          </div>

          <div className="divide-y divide-gray-200">
            {problemasFiltrados.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No se encontraron problemas con los filtros aplicados
              </div>
            ) : (
              problemasFiltrados.map((problema) => {
                const isExpanded = problemaSeleccionado === problema.pregunta_id
                
                return (
                  <div key={problema.pregunta_id}>
                    <button
                      onClick={() => seleccionarProblema(problema.pregunta_id)}
                      className="w-full p-6 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {/* Badge de Criticidad */}
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                              problema.criticidad === 'CRITICA' ? 'bg-red-100 text-red-800' :
                              problema.criticidad === 'ALTA' ? 'bg-orange-100 text-orange-800' :
                              problema.criticidad === 'MEDIA' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {problema.criticidad}
                            </span>

                            {/* Badge de Tendencia */}
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              problema.tendencia === 'EMPEORANDO' ? 'bg-red-50 text-red-700' :
                              problema.tendencia === 'MEJORANDO' ? 'bg-green-50 text-green-700' :
                              'bg-gray-50 text-gray-700'
                            }`}>
                              {problema.tendencia === 'EMPEORANDO' && <TrendingDown className="w-3 h-3" />}
                              {problema.tendencia === 'MEJORANDO' && <TrendingUp className="w-3 h-3" />}
                              {problema.tendencia === 'ESTABLE' && <Minus className="w-3 h-3" />}
                              {problema.tendencia}
                            </span>

                            {problema.fotos_evidencia > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <Camera className="w-3 h-3" />
                                {problema.fotos_evidencia} foto{problema.fotos_evidencia !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {problema.texto_pregunta}
                          </h3>

                          <div className="flex items-center gap-6 text-sm text-gray-600">
                            <span>
                              <strong className="text-red-600">{problema.total_fallos}</strong> fallos de {problema.total_evaluaciones} evaluaciones
                            </span>
                            <span>
                              Afecta a <strong>{problema.afecta_activos}</strong> grúa{problema.afecta_activos !== 1 ? 's' : ''}
                            </span>
                            <span>
                              Última vez: {new Date(problema.ultima_ocurrencia).toLocaleDateString('es-CL')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 ml-4">
                          <div className="text-right">
                            <div className="text-3xl font-bold text-red-600">
                              {problema.porcentaje_fallo}%
                            </div>
                            <div className="text-xs text-gray-500">Tasa de fallo</div>
                          </div>
                          
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Panel expandido con detalles */}
                    {isExpanded && (
                      <div className="px-6 pb-6 bg-gray-50 border-t border-gray-200">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                          {/* Gráfico de evolución */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-4">Evolución Temporal (últimos 90 días)</h4>
                            {evolucion.length > 0 ? (
                              <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={evolucion}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis 
                                    dataKey="fecha" 
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                  />
                                  <YAxis />
                                  <Tooltip 
                                    labelFormatter={(value) => new Date(value).toLocaleDateString('es-CL')}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="porcentaje_fallo" 
                                    stroke="#ef4444" 
                                    strokeWidth={2}
                                    name="% Fallo"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="text-center py-8 text-gray-500">Sin datos suficientes</div>
                            )}
                          </div>

                          {/* Activos más afectados */}
                          <div className="bg-white rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-4">Activos Más Afectados</h4>
                            {activosAfectados.length > 0 ? (
                              <div className="space-y-3">
                                {activosAfectados.slice(0, 5).map((activo) => (
                                  <div key={activo.activo_id} className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-900">{activo.activo_nombre}</p>
                                      <p className="text-xs text-gray-500">
                                        {activo.total_fallos} de {activo.total_evaluaciones} inspecciones
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-lg font-bold text-red-600">
                                        {activo.porcentaje_fallo}%
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500">Sin datos</div>
                            )}
                          </div>
                        </div>

                        {/* Acción recomendada */}
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Acción Recomendada
                          </h4>
                          <p className="text-sm text-blue-800">
                            {problema.criticidad === 'CRITICA' && 
                              "🚨 Problema crítico: Requiere atención inmediata. Considere detener operaciones hasta resolver."
                            }
                            {problema.criticidad === 'ALTA' && 
                              "⚠️ Prioridad alta: Programar mantenimiento correctivo en las próximas 48 horas."
                            }
                            {problema.criticidad === 'MEDIA' && 
                              "📋 Prioridad media: Incluir en el próximo ciclo de mantenimiento preventivo."
                            }
                            {problema.tendencia === 'EMPEORANDO' && 
                              " El problema está empeorando con el tiempo, lo que sugiere desgaste acelerado."
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Insights generales */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Recomendaciones Generales</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Problemas con más del 50% de falla requieren intervención inmediata</li>
                <li>• Problemas con tendencia &ldquo;Empeorando&rdquo; sugieren desgaste acelerado de componentes</li>
                <li>• Si un problema afecta múltiples activos, considere revisar proveedor o procedimiento</li>
                <li>• Las fotos de evidencia ayudan a diagnosticar la causa raíz del problema</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}