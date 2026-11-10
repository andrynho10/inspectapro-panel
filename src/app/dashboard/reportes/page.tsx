'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  Filter,
  Search
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { obtenerReportesConFiltros } from '@/lib/reportes-service'
import { obtenerActivos } from '@/lib/activos-service'
import { Activo, supabase } from '@/lib/supabase'
import ExportButton from '@/components/ExportButton'
import {
  exportarAExcel,
  exportarACSV,
  generarNombreArchivo,
  formatearFechaExcel,
  formatearFechaSoloExcel,
  formatearPorcentaje,
  calcularAntiguedad
} from '@/lib/export-utils'

type ReportesFiltroOverrides = {
  fechaDesde?: string
  fechaHasta?: string
  activoSeleccionado?: number
  operadorSeleccionado?: string
  turnoSeleccionado?: number
  soloProblemas?: boolean
}

function ReportesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [reportes, setReportes] = useState<Array<Record<string, unknown>>>([])
  const [activos, setActivos] = useState<Activo[]>([])
  const [usuarios, setUsuarios] = useState<Array<Record<string, unknown>>>([])
  const [filtrosAplicados, setFiltrosAplicados] = useState(false)
  
  // Filtros
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [activoSeleccionado, setActivoSeleccionado] = useState<number | undefined>()
  const [operadorSeleccionado, setOperadorSeleccionado] = useState<string | undefined>()
  const [soloProblemas, setSoloProblemas] = useState(false)
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<number | undefined>()
  const [busqueda, setBusqueda] = useState('')
  const [mostrandoLimitado, setMostrandoLimitado] = useState(true)
  const [cargandoTodo, setCargandoTodo] = useState(false)

  const cargarActivos = useCallback(async () => {
    const data = await obtenerActivos()
    setActivos(data)
  }, [])

  const cargarUsuarios = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre_completo, rol')
        .eq('rol', 'OPERADOR')
        .order('nombre_completo', { ascending: true })

      if (error) throw error
      setUsuarios(data || [])
    } catch (error) {
      console.error('Error cargando usuarios:', error)
    }
  }, [])

  // Permite pasar overrides de filtros sin esperar el re-render de estado; útil al aplicar filtros de URL inmediatamente
  const cargarReportes = useCallback(async (overrides: ReportesFiltroOverrides = {}, cargarTodo = false) => {
    const fechaDesdeValue = Object.prototype.hasOwnProperty.call(overrides, 'fechaDesde')
      ? overrides.fechaDesde
      : fechaDesde
    const fechaHastaValue = Object.prototype.hasOwnProperty.call(overrides, 'fechaHasta')
      ? overrides.fechaHasta
      : fechaHasta
    const activoValue = Object.prototype.hasOwnProperty.call(overrides, 'activoSeleccionado')
      ? overrides.activoSeleccionado
      : activoSeleccionado
    const operadorValue = Object.prototype.hasOwnProperty.call(overrides, 'operadorSeleccionado')
      ? overrides.operadorSeleccionado
      : operadorSeleccionado
    const turnoValue = Object.prototype.hasOwnProperty.call(overrides, 'turnoSeleccionado')
      ? overrides.turnoSeleccionado
      : turnoSeleccionado
    const soloProblemasValue = Object.prototype.hasOwnProperty.call(overrides, 'soloProblemas')
      ? overrides.soloProblemas ?? false
      : soloProblemas

    const data = await obtenerReportesConFiltros(
      fechaDesdeValue || undefined,
      fechaHastaValue || undefined,
      activoValue,
      soloProblemasValue,
      operadorValue,
      turnoValue,
      cargarTodo
    )

    setReportes(data)

    // Determinar si estamos mostrando datos limitados
    const tieneRangoFechas = !!(fechaDesdeValue || fechaHastaValue)
    setMostrandoLimitado(!cargarTodo && !tieneRangoFechas)
  }, [fechaDesde, fechaHasta, activoSeleccionado, operadorSeleccionado, turnoSeleccionado, soloProblemas])

  // Verifica rol SUPERVISOR y carga activos + usuarios en paralelo antes de renderizar filtros
  const checkAuthAndLoad = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    await Promise.all([
      cargarActivos(),
      cargarUsuarios()
    ])

    // Si la URL ya trae filtros (desde el dashboard), no se cargan reportes sin filtrar para evitar carga innecesaria
    const hasUrlFilters = ['problemas', 'activo', 'desde', 'hasta'].some((param) => searchParams.has(param))

    // Solo cargar reportes inicialmente si NO hay filtros desde URL
    if (!hasUrlFilters) {
      await cargarReportes()
    }

    setLoading(false)
  }, [router, cargarActivos, cargarUsuarios, searchParams, cargarReportes])

  useEffect(() => {
    checkAuthAndLoad()
  }, [checkAuthAndLoad])

  useEffect(() => {
    const problemasParam = searchParams.get('problemas')
    const activoParam = searchParams.get('activo')
    const fechaDesdeParam = searchParams.get('desde')
    const fechaHastaParam = searchParams.get('hasta')

    let filtrosDesdeUrl = false

    const problemasActivos = problemasParam === 'true'
    setSoloProblemas(problemasActivos)
    if (problemasActivos) {
      filtrosDesdeUrl = true
    }

    if (activoParam) {
      const activoId = Number(activoParam)
      if (!Number.isNaN(activoId)) {
        setActivoSeleccionado(activoId)
        filtrosDesdeUrl = true
      }
    } else {
      setActivoSeleccionado(undefined)
    }

    if (fechaDesdeParam) {
      setFechaDesde(fechaDesdeParam)
      filtrosDesdeUrl = true
    } else {
      setFechaDesde('')
    }

    if (fechaHastaParam) {
      setFechaHasta(fechaHastaParam)
      filtrosDesdeUrl = true
    } else {
      setFechaHasta('')
    }

    if (filtrosDesdeUrl) {
      setFiltrosAplicados(true)
    }
  }, [searchParams])

  // Dispara la carga de reportes cuando los filtros de URL han sido procesados (evita múltiples ejecuciones)
  useEffect(() => {
    if (filtrosAplicados && !loading) {
      void cargarReportes()
      setFiltrosAplicados(false) // Reset para que no se ejecute múltiples veces
    }
  }, [filtrosAplicados, loading, cargarReportes])

  async function aplicarFiltros(overrides?: ReportesFiltroOverrides) {
    setLoading(true)
    await cargarReportes(overrides)
    setLoading(false)
  }

  async function cargarTodosLosReportes() {
    setCargandoTodo(true)
    await cargarReportes({}, true)
    setCargandoTodo(false)
  }

  function limpiarFiltros() {
    setFechaDesde('')
    setFechaHasta('')
    setActivoSeleccionado(undefined)
    setOperadorSeleccionado(undefined)
    setTurnoSeleccionado(undefined)
    setSoloProblemas(false)
    setBusqueda('')
    setFiltrosAplicados(false)

    const params = new URLSearchParams(Array.from(searchParams.entries()))
    let paramsModificados = false
    const paramsToClear = ['problemas', 'activo', 'desde', 'hasta'] as const

    paramsToClear.forEach((param) => {
      if (params.has(param)) {
        params.delete(param)
        paramsModificados = true
      }
    })

    if (paramsModificados) {
      const queryString = params.toString()
      router.replace(
        queryString ? `/dashboard/reportes?${queryString}` : '/dashboard/reportes',
        { scroll: false }
      )
    }
  }

  const handleLimpiarFiltros = () => {
    limpiarFiltros()
    void aplicarFiltros({
      fechaDesde: undefined,
      fechaHasta: undefined,
      activoSeleccionado: undefined,
      operadorSeleccionado: undefined,
      turnoSeleccionado: undefined,
      soloProblemas: false
    })
  }

  async function exportarReportesExcel() {
    if (reportesFiltrados.length === 0) {
      alert('No hay reportes para exportar')
      return
    }

    const datosExport = reportesFiltrados.map(reporte => ({
      'ID Reporte': reporte.id,
      'Fecha/Hora Completado': formatearFechaExcel(reporte.timestamp_completado as string),
      'Grúa': (reporte.activo as { nombre?: string } | undefined)?.nombre || '-',
      'Modelo Grúa': (reporte.activo as { modelo?: string } | undefined)?.modelo || '-',
      'ID Usuario': (reporte.usuario as { id?: string } | undefined)?.id || '-',
      'Operador': (reporte.usuario as { nombre_completo?: string } | undefined)?.nombre_completo || '-',
      'Rol': (reporte.usuario as { rol?: string } | undefined)?.rol || '-',
      'RUT Operador': (reporte.usuario as { rut?: string } | undefined)?.rut || '-',
      'ID Alternativo': (reporte.usuario as { id_alternativo?: string } | undefined)?.id_alternativo || '-',
      'Centro Costo': (reporte.usuario as { centro_costo?: string } | undefined)?.centro_costo || '-',
      'Cargo': (reporte.usuario as { cargo?: string } | undefined)?.cargo || '-',
      'Fecha Ingreso': formatearFechaSoloExcel((reporte.usuario as { fecha_ingreso?: string } | undefined)?.fecha_ingreso),
      'Antigüedad': calcularAntiguedad((reporte.usuario as { fecha_ingreso?: string } | undefined)?.fecha_ingreso),
      'Fecha Creación Usuario': formatearFechaExcel((reporte.usuario as { created_at?: string } | undefined)?.created_at),
      'Turno': reporte.turno ? `Turno ${reporte.turno}` : '-',
      'Duración (min)': reporte.duracion_minutos,
      'Score': formatearPorcentaje(Number(reporte.score_cumplimiento), 2),
      'Total Items': reporte.total_respuestas,
      'Items Malos': reporte.respuestas_malas,
      'Tiene Problemas': reporte.tiene_problemas ? 'Sí' : 'No',
      'Horómetro Inicial': reporte.horometro_inicial !== null ? `${reporte.horometro_inicial}h` : '-',
      'Horómetro Final': reporte.horometro_final !== null ? `${reporte.horometro_final}h` : '-',
      'Horas Uso': reporte.horas_uso !== null ? `${reporte.horas_uso}h` : '-',
      'Horas Uso Omitidas': reporte.horometro_inicial !== null && reporte.horas_uso === null ? 'Sí' : 'No'
    }))

    const nombreArchivo = generarNombreArchivo('reportes', 'xlsx')
    exportarAExcel(datosExport, nombreArchivo, 'Reportes')
  }

  async function exportarReportesCSV() {
    if (reportesFiltrados.length === 0) {
      alert('No hay reportes para exportar')
      return
    }

    const datosExport = reportesFiltrados.map(reporte => ({
      'ID Reporte': reporte.id,
      'Fecha/Hora Completado': formatearFechaExcel(reporte.timestamp_completado as string),
      'Grúa': (reporte.activo as { nombre?: string } | undefined)?.nombre || '-',
      'Modelo Grúa': (reporte.activo as { modelo?: string } | undefined)?.modelo || '-',
      'ID Usuario': (reporte.usuario as { id?: string } | undefined)?.id || '-',
      'Operador': (reporte.usuario as { nombre_completo?: string } | undefined)?.nombre_completo || '-',
      'Rol': (reporte.usuario as { rol?: string } | undefined)?.rol || '-',
      'RUT Operador': (reporte.usuario as { rut?: string } | undefined)?.rut || '-',
      'ID Alternativo': (reporte.usuario as { id_alternativo?: string } | undefined)?.id_alternativo || '-',
      'Centro Costo': (reporte.usuario as { centro_costo?: string } | undefined)?.centro_costo || '-',
      'Cargo': (reporte.usuario as { cargo?: string } | undefined)?.cargo || '-',
      'Fecha Ingreso': formatearFechaSoloExcel((reporte.usuario as { fecha_ingreso?: string } | undefined)?.fecha_ingreso),
      'Antigüedad': calcularAntiguedad((reporte.usuario as { fecha_ingreso?: string } | undefined)?.fecha_ingreso),
      'Fecha Creación Usuario': formatearFechaExcel((reporte.usuario as { created_at?: string } | undefined)?.created_at),
      'Turno': reporte.turno ? `Turno ${reporte.turno}` : '-',
      'Duración (min)': reporte.duracion_minutos,
      'Score': formatearPorcentaje(Number(reporte.score_cumplimiento), 2),
      'Total Items': reporte.total_respuestas,
      'Items Malos': reporte.respuestas_malas,
      'Tiene Problemas': reporte.tiene_problemas ? 'Sí' : 'No',
      'Horómetro Inicial': reporte.horometro_inicial !== null ? `${reporte.horometro_inicial}h` : '-',
      'Horómetro Final': reporte.horometro_final !== null ? `${reporte.horometro_final}h` : '-',
      'Horas Uso': reporte.horas_uso !== null ? `${reporte.horas_uso}h` : '-',
      'Horas Uso Omitidas': reporte.horometro_inicial !== null && reporte.horas_uso === null ? 'Sí' : 'No'
    }))

    const nombreArchivo = generarNombreArchivo('reportes', 'csv')
    exportarACSV(datosExport, nombreArchivo)
  }

  // Filtrar por búsqueda local
  const reportesFiltrados = reportes.filter(reporte => {
    if (!busqueda) return true
    
    const searchLower = busqueda.toLowerCase()
    const activo = reporte.activo as { nombre?: string } | undefined
    const usuario = reporte.usuario as { nombre_completo?: string } | undefined
    const id = reporte.id as string | undefined
    return (
      activo?.nombre?.toLowerCase().includes(searchLower) ||
      usuario?.nombre_completo?.toLowerCase().includes(searchLower) ||
      id?.toLowerCase().includes(searchLower)
    )
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando reportes...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Lista de Reportes</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600">{reportesFiltrados.length} reportes encontrados</p>
                {mostrandoLimitado && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    Últimos 30 días
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ExportButton
                onExport={exportarReportesExcel}
                label="Exportar a Excel"
                variant="primary"
                icon="excel"
                disabled={reportesFiltrados.length === 0}
              />
              <ExportButton
                onExport={exportarReportesCSV}
                label="Exportar a CSV"
                variant="secondary"
                icon="csv"
                disabled={reportesFiltrados.length === 0}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Búsqueda
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Grúa, operador, ID..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Fecha Desde */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Fecha Hasta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Grúa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Grúa
              </label>
              <select
                value={activoSeleccionado || ''}
                onChange={(e) => setActivoSeleccionado(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas</option>
                {activos.map(activo => (
                  <option key={activo.id} value={activo.id}>
                    {activo.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Segunda fila: Turno y Operador */}
          <div className="flex gap-4">
            {/* Turno */}
            <div className="w-70">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Turno
              </label>
              <select
                value={turnoSeleccionado || ''}
                onChange={(e) => setTurnoSeleccionado(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                <option value="1">Turno 1 (Noche)</option>
                <option value="2">Turno 2 (Mañana)</option>
                <option value="3">Turno 3 (Tarde)</option>
              </select>
            </div>

            {/* Operador */}
            <div className="w-72">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Operador
              </label>
              <select
                value={operadorSeleccionado || ''}
                onChange={(e) => setOperadorSeleccionado(e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                {usuarios.map(usuario => (
                  <option key={String(usuario.id)} value={String(usuario.id)}>
                    {String(usuario.nombre_completo)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Solo con problemas */}
          <div className="mt-4 flex items-center">
            <input
              type="checkbox"
              id="soloProblemas"
              checked={soloProblemas}
              onChange={(e) => setSoloProblemas(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="soloProblemas" className="ml-2 text-sm text-gray-700">
              Solo mostrar reportes con problemas
            </label>
          </div>

          {/* Botones */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => void aplicarFiltros()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium cursor-pointer"
            >
              Aplicar Filtros
            </button>
            <button
              onClick={handleLimpiarFiltros}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Banner informativo cuando se muestra limitado */}
        {mostrandoLimitado && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Mostrando reportes de los últimos 30 días (máximo 1000)
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Para ver reportes más antiguos, use los filtros de fecha o cargue todo el historial.
                </p>
              </div>
            </div>
            <button
              onClick={cargarTodosLosReportes}
              disabled={cargandoTodo}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {cargandoTodo ? 'Cargando...' : 'Cargar Todo'}
            </button>
          </div>
        )}

        {/* Lista de Reportes */}
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {reportesFiltrados.length === 0 ? (
            <div className="p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No se encontraron reportes con los filtros aplicados</p>
            </div>
          ) : (
            reportesFiltrados.map((reporte) => {
              const activo = reporte.activo as { nombre?: string } | undefined
              const usuario = reporte.usuario as { nombre_completo?: string } | undefined
              const fecha = new Date(reporte.timestamp_completado as string).toLocaleString('es-CL', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })

              return (
                <button
                  key={String(reporte.id)}
                  onClick={() => router.push(`/dashboard/reportes/${String(reporte.id)}`)}
                  className="w-full p-6 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      {/* Icono Estado */}
                      <div className={`rounded-full p-3 ${
                        reporte.tiene_problemas ? 'bg-red-50' : 'bg-green-50'
                      }`}>
                        {reporte.tiene_problemas ? (
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                      </div>

                      {/* Info Principal */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900">
                            {activo?.nombre || 'Grúa Desconocida'}
                          </h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            Boolean(reporte.tiene_problemas) 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            Score: {Number(reporte.score_cumplimiento)}%
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {usuario?.nombre_completo || 'Operador Desconocido'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fecha}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Number(reporte.duracion_minutos)} min
                          </span>
                          {Boolean(reporte.turno) && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                              Turno {String(reporte.turno)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-gray-500">Items</p>
                        <p className="font-semibold text-gray-900">{Number(reporte.total_respuestas)}</p>
                      </div>
                      {Number(reporte.respuestas_malas) > 0 && (
                        <div className="text-center">
                          <p className="text-gray-500">Problemas</p>
                          <p className="font-semibold text-red-600">{Number(reporte.respuestas_malas)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

export default function ReportesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando reportes...</p>
        </div>
      </div>
    }>
      <ReportesContent />
    </Suspense>
  )
}
