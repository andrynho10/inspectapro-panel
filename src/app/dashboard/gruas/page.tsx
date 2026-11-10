'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Forklift, Power, PowerOff, AlertCircle, CheckCircle, Timer, Plus, Edit, Trash2, X, History } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import {
  cambiarEstadoActivo,
  obtenerAgregadosDiariosActivos,
  construirResumenUsoActivos,
  ResumenUsoActivo,
  crearActivo,
  actualizarActivo,
  eliminarActivo,
  CrearActivoInput,
  obtenerActivosConTiempoDesactivada,
  ActivoConEstado,
  obtenerHistorialEstados
} from '@/lib/activos-service'
import ExportButton from '@/components/ExportButton'
import {
  exportarAExcel,
  exportarACSV,
  generarNombreArchivo,
  formatearFechaExcel
} from '@/lib/export-utils'

type DialogType = 'estado' | 'crear' | 'editar' | 'eliminar' | 'historial' | null

type HistorialEstado = {
  id: number
  activo_id: number
  fecha_cambio: string
  es_operativa: boolean
  usuario_cambio: string
  motivo: string | null
  usuarios: {
    nombre_completo: string
  } | null
}

export default function GruasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<{ id: string; rol: string } | null>(null)
  const [activos, setActivos] = useState<ActivoConEstado[]>([])
  const [resumenUso, setResumenUso] = useState<ResumenUsoActivo[]>([])
  const [dialogType, setDialogType] = useState<DialogType>(null)
  const [selectedActivo, setSelectedActivo] = useState<ActivoConEstado | null>(null)
  const [motivo, setMotivo] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [historial, setHistorial] = useState<HistorialEstado[]>([])
  const [historialLoading, setHistorialLoading] = useState(false)

  // Estado para el formulario de crear/editar
  const [formData, setFormData] = useState<CrearActivoInput>({
    nombre: '',
    modelo: '',
    tipo: '',
    codigo_qr: '',
    es_operativa: true,
    horometro_actual: null
  })

  const resumenPorActivo = useMemo(() => {
    const map = new Map<number, ResumenUsoActivo>()
    resumenUso.forEach((item) => {
      map.set(item.activoId, item)
    })
    return map
  }, [resumenUso])

  const totalesUso = useMemo(() => {
    return resumenUso.reduce(
      (acc, item) => {
        acc.horasUso7 += item.horasUso7
        acc.horasUso30 += item.horasUso30
        acc.problemas30 += item.problemas30
        return acc
      },
      { horasUso7: 0, horasUso30: 0, problemas30: 0 }
    )
  }, [resumenUso])

  const formatHoras = (valor: number) =>
    valor > 0
      ? valor.toLocaleString('es-CL', { minimumFractionDigits: 1 })
      : '0'

  // Funciones de exportación
  function exportarGruasExcel() {
    if (activos.length === 0) {
      alert('No hay grúas para exportar')
      return
    }

    const datosExport = activos.map(activo => {
      const resumen = resumenPorActivo.get(activo.id)

      return {
        'ID': activo.id,
        'Nombre': activo.nombre,
        'Modelo': activo.modelo,
        'Tipo': activo.tipo,
        'Código QR': activo.codigo_qr,
        'Estado': activo.es_operativa ? 'Operativa' : 'Fuera de Servicio',
        'Horómetro Actual (h)': activo.horometro_actual !== null ? activo.horometro_actual : '-',
        'Días Desactivada': activo.dias_desactivada !== null ? activo.dias_desactivada : '-',
        'Horas Desactivada': activo.horas_desactivada !== null ? activo.horas_desactivada : '-',
        'Fecha Desactivación': activo.fecha_desactivacion ? formatearFechaExcel(activo.fecha_desactivacion) : '-',
        'Motivo Desactivación': activo.motivo_desactivacion || '-',
        'Usuario Desactivación': activo.usuario_desactivacion || '-',
        'Horas Operación 30d': resumen?.horasUso30 ?? 0,
        'Horas Operación 7d': resumen?.horasUso7 ?? 0,
        'Inspecciones 30d': resumen?.inspecciones30 ?? 0,
        'Problemas 30d': resumen?.problemas30 ?? 0
      }
    })

    const nombreArchivo = generarNombreArchivo('gruas', 'xlsx')
    exportarAExcel(datosExport, nombreArchivo, 'Grúas')
  }

  function exportarGruasCSV() {
    if (activos.length === 0) {
      alert('No hay grúas para exportar')
      return
    }

    const datosExport = activos.map(activo => {
      const resumen = resumenPorActivo.get(activo.id)

      return {
        'ID': activo.id,
        'Nombre': activo.nombre,
        'Modelo': activo.modelo,
        'Tipo': activo.tipo,
        'Código QR': activo.codigo_qr,
        'Estado': activo.es_operativa ? 'Operativa' : 'Fuera de Servicio',
        'Horómetro Actual (h)': activo.horometro_actual !== null ? activo.horometro_actual : '-',
        'Días Desactivada': activo.dias_desactivada !== null ? activo.dias_desactivada : '-',
        'Horas Desactivada': activo.horas_desactivada !== null ? activo.horas_desactivada : '-',
        'Fecha Desactivación': activo.fecha_desactivacion ? formatearFechaExcel(activo.fecha_desactivacion) : '-',
        'Motivo Desactivación': activo.motivo_desactivacion || '-',
        'Usuario Desactivación': activo.usuario_desactivacion || '-',
        'Horas Operación 30d': resumen?.horasUso30 ?? 0,
        'Horas Operación 7d': resumen?.horasUso7 ?? 0,
        'Inspecciones 30d': resumen?.inspecciones30 ?? 0,
        'Problemas 30d': resumen?.problemas30 ?? 0
      }
    })

    const nombreArchivo = generarNombreArchivo('gruas', 'csv')
    exportarACSV(datosExport, nombreArchivo)
  }

  const cargarActivos = useCallback(async () => {
    const [activosData, agregadosData] = await Promise.all([
      obtenerActivosConTiempoDesactivada(),
      obtenerAgregadosDiariosActivos(30)
    ])

    setActivos(activosData)
    setResumenUso(construirResumenUsoActivos(agregadosData))
  }, [])

  const checkAuth = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    setUsuario(user)
    await cargarActivos()
    setLoading(false)
  }, [router, cargarActivos])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  async function handleCambiarEstado(activo: ActivoConEstado) {
    setSelectedActivo(activo)
    setDialogType('estado')
  }

  async function confirmarCambioEstado() {
    if (!selectedActivo || !usuario) return

    setActionLoading(true)
    const result = await cambiarEstadoActivo(
      selectedActivo.id,
      !selectedActivo.es_operativa,
      usuario.id,
      motivo || undefined
    )

    if (result.success) {
      await cargarActivos()
      cerrarDialogos()
    } else {
      alert('Error al cambiar estado: ' + result.error)
    }

    setActionLoading(false)
  }

  function abrirCrearGrua() {
    setFormData({
      nombre: '',
      modelo: '',
      tipo: '',
      codigo_qr: '',
      es_operativa: true,
      horometro_actual: null
    })
    setDialogType('crear')
  }

  function abrirEditarGrua(activo: ActivoConEstado) {
    setSelectedActivo(activo)
    setFormData({
      nombre: activo.nombre,
      modelo: activo.modelo,
      tipo: activo.tipo,
      codigo_qr: activo.codigo_qr,
      es_operativa: activo.es_operativa,
      horometro_actual: activo.horometro_actual
    })
    setDialogType('editar')
  }

  function abrirEliminarGrua(activo: ActivoConEstado) {
    setSelectedActivo(activo)
    setDialogType('eliminar')
  }

  function cerrarDialogos() {
    setDialogType(null)
    setSelectedActivo(null)
    setMotivo('')
    setHistorial([])
    setFormData({
      nombre: '',
      modelo: '',
      tipo: '',
      codigo_qr: '',
      es_operativa: true,
      horometro_actual: null
    })
  }

  async function abrirHistorial(activo: ActivoConEstado) {
    setSelectedActivo(activo)
    setDialogType('historial')
    setHistorialLoading(true)

    const historialData = await obtenerHistorialEstados(activo.id)
    setHistorial(historialData as HistorialEstado[])
    setHistorialLoading(false)
  }

  function exportarHistorialExcel() {
    if (!selectedActivo || historial.length === 0) {
      alert('No hay historial para exportar')
      return
    }

    const datosExport = historial.map(item => ({
      'Fecha': formatearFechaExcel(item.fecha_cambio),
      'Hora': new Date(item.fecha_cambio).toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      'Estado': item.es_operativa ? 'Activada' : 'Desactivada',
      'Usuario': item.usuarios?.nombre_completo || 'No disponible',
      'Motivo': item.motivo || '-'
    }))

    const nombreArchivo = generarNombreArchivo(`historial_${selectedActivo.nombre}`, 'xlsx')
    exportarAExcel(datosExport, nombreArchivo, `Historial ${selectedActivo.nombre}`)
  }

  function exportarHistorialCSV() {
    if (!selectedActivo || historial.length === 0) {
      alert('No hay historial para exportar')
      return
    }

    const datosExport = historial.map(item => ({
      'Fecha': formatearFechaExcel(item.fecha_cambio),
      'Hora': new Date(item.fecha_cambio).toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      'Estado': item.es_operativa ? 'Activada' : 'Desactivada',
      'Usuario': item.usuarios?.nombre_completo || 'No disponible',
      'Motivo': item.motivo || '-'
    }))

    const nombreArchivo = generarNombreArchivo(`historial_${selectedActivo.nombre}`, 'csv')
    exportarACSV(datosExport, nombreArchivo)
  }

  async function handleCrearGrua() {
    if (!formData.nombre || !formData.modelo || !formData.tipo || !formData.codigo_qr) {
      alert('Por favor completa todos los campos obligatorios')
      return
    }

    setActionLoading(true)
    const result = await crearActivo(formData)

    if (result.success) {
      await cargarActivos()
      cerrarDialogos()
    } else {
      alert('Error al crear grúa: ' + result.error)
    }

    setActionLoading(false)
  }

  async function handleActualizarGrua() {
    if (!selectedActivo) return
    if (!formData.nombre || !formData.modelo || !formData.tipo || !formData.codigo_qr) {
      alert('Por favor completa todos los campos obligatorios')
      return
    }

    setActionLoading(true)
    const result = await actualizarActivo(selectedActivo.id, formData)

    if (result.success) {
      await cargarActivos()
      cerrarDialogos()
    } else {
      alert('Error al actualizar grúa: ' + result.error)
    }

    setActionLoading(false)
  }

  async function handleEliminarGrua() {
    if (!selectedActivo) return

    setActionLoading(true)
    const result = await eliminarActivo(selectedActivo.id)

    if (result.success) {
      await cargarActivos()
      cerrarDialogos()
    } else {
      alert('Error al eliminar grúa: ' + result.error)
    }

    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando grúas...</p>
        </div>
      </div>
    )
  }

  const activasCount = activos.filter((a) => a.es_operativa).length
  const inactivasCount = activos.filter((a) => !a.es_operativa).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestión de Grúas</h1>
              <p className="text-sm text-gray-600">
                {activasCount} operativas | {inactivasCount} inactivas
              </p>
            </div>
            <div className="flex gap-3">
              <ExportButton
                onExport={exportarGruasExcel}
                label="Exportar a Excel"
                variant="primary"
                icon="excel"
                disabled={activos.length === 0}
              />
              <ExportButton
                onExport={exportarGruasCSV}
                label="Exportar a CSV"
                variant="secondary"
                icon="csv"
                disabled={activos.length === 0}
              />
              <button
                onClick={abrirCrearGrua}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Grúa
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 cursor-pointer"
              >
                Volver al Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-50 rounded-full p-3">
                <Forklift className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 mt-3">Total Grúas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{activos.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col items-center text-center">
              <div className="bg-green-50 rounded-full p-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm text-gray-600 mt-3">Operativas</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{activasCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col items-center text-center">
              <div className="bg-red-50 rounded-full p-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-sm text-gray-600 mt-3">Inactivas</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{inactivasCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col items-center text-center">
              <div className="bg-yellow-50 rounded-full p-3">
                <Timer className="w-6 h-6 text-yellow-600" />
              </div>
              <p className="text-sm text-gray-600 mt-3">Horas de uso</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatHoras(totalesUso.horasUso30)} h</p>
              <p className="text-xs text-gray-500 mt-1">Últimos 30 días</p>
              <p className="text-xs text-gray-500">7 días: {formatHoras(totalesUso.horasUso7)} h</p>
            </div>
          </div>

        </div>

        {/* Lista de Grúas */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Lista de Grúas</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {activos.map((activo) => {
              const resumen = resumenPorActivo.get(activo.id)
              const horasUso7 = resumen?.horasUso7 ?? 0
              const horasUso30 = resumen?.horasUso30 ?? 0
              const inspecciones30 = resumen?.inspecciones30 ?? 0
              const problemas30 = resumen?.problemas30 ?? 0

              return (
                <div key={activo.id} className="p-6 hover:bg-gray-50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`rounded-full p-3 ${
                        activo.es_operativa ? 'bg-green-50' : 'bg-gray-100'
                      }`}>
                        <Forklift className={`w-6 h-6 ${
                          activo.es_operativa ? 'text-green-600' : 'text-gray-400'
                        }`} />
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{activo.nombre}</h3>
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
                          <span>Modelo: {activo.modelo}</span>
                          <span>Tipo: {activo.tipo}</span>
                          {activo.horometro_actual !== null && (
                            <span>Horómetro: {activo.horometro_actual}h</span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            activo.es_operativa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {activo.es_operativa ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Operativa
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Fuera de Servicio
                              </>
                            )}
                          </span>

                          {!activo.es_operativa && activo.dias_desactivada !== null && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
                              title={`Desactivada el ${new Date(activo.fecha_desactivacion!).toLocaleDateString('es-CL')}${activo.motivo_desactivacion ? ` - ${activo.motivo_desactivacion}` : ''}`}
                            >
                              <Timer className="w-3 h-3 mr-1" />
                              {activo.dias_desactivada > 0
                                ? `${activo.dias_desactivada}d ${activo.horas_desactivada}h desactivada`
                                : `${activo.horas_desactivada}h desactivada`
                              }
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Horas uso 7d</p>
                            <p className="font-semibold text-gray-900">{formatHoras(horasUso7)} h</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Horas uso 30d</p>
                            <p className="font-semibold text-gray-900">{formatHoras(horasUso30)} h</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Inspecciones 30d</p>
                            <p className="font-semibold text-gray-900">{inspecciones30}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Problemas 30d</p>
                            <p className={`font-semibold ${problemas30 > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {problemas30}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => abrirHistorial(activo)}
                        className="flex items-center justify-center px-3 py-2 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 font-medium cursor-pointer"
                        title="Ver historial"
                      >
                        <History className="w-4 h-4 mr-1" />
                        Historial
                      </button>
                      <button
                        onClick={() => abrirEditarGrua(activo)}
                        className="flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 font-medium cursor-pointer"
                        title="Editar grúa"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleCambiarEstado(activo)}
                        className={`flex items-center justify-center px-3 py-2 rounded-md font-medium cursor-pointer ${
                          activo.es_operativa
                            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                        title={activo.es_operativa ? 'Desactivar' : 'Activar'}
                      >
                        {activo.es_operativa ? (
                          <>
                            <PowerOff className="w-4 h-4 mr-1" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4 mr-1" />
                            Activar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => abrirEliminarGrua(activo)}
                        className="flex items-center justify-center px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium cursor-pointer"
                        title="Eliminar grúa"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Dialog de Cambio de Estado */}
      {dialogType === 'estado' && selectedActivo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedActivo.es_operativa ? 'Desactivar' : 'Activar'} Grúa
            </h3>

            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres {selectedActivo.es_operativa ? 'desactivar' : 'activar'} la grúa <strong>{selectedActivo.nombre}</strong>?
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo (opcional)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Ej: Mantenimiento programado, falla mecánica, etc."
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={cerrarDialogos}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCambioEstado}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 rounded-md text-white font-medium disabled:opacity-50 ${
                  selectedActivo.es_operativa
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {actionLoading ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de Crear/Editar Grúa */}
      {(dialogType === 'crear' || dialogType === 'editar') && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {dialogType === 'crear' ? 'Nueva Grúa' : 'Editar Grúa'}
              </h3>
              <button
                onClick={cerrarDialogos}
                disabled={actionLoading}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 301"
                  disabled={actionLoading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.modelo}
                    onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: BPT"
                    disabled={actionLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Grúa Horquilla"
                    disabled={actionLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código QR <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.codigo_qr}
                  onChange={(e) => setFormData({ ...formData, codigo_qr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="IP-GH-009"
                  disabled={actionLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horómetro Actual (horas)
                </label>
                <input
                  type="number"
                  value={formData.horometro_actual ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    horometro_actual: e.target.value ? Number(e.target.value) : null
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  disabled={actionLoading}
                  min="0"
                  step="0.1"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.es_operativa}
                    onChange={(e) => setFormData({ ...formData, es_operativa: e.target.checked })}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={actionLoading}
                  />
                  <span className="text-sm text-gray-700">Operativa</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={cerrarDialogos}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={dialogType === 'crear' ? handleCrearGrua : handleActualizarGrua}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {actionLoading ? 'Procesando...' : (dialogType === 'crear' ? 'Crear Grúa' : 'Guardar Cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de Eliminar */}
      {dialogType === 'eliminar' && selectedActivo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-600 mb-4">
              Eliminar Grúa
            </h3>

            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres eliminar la grúa <strong>{selectedActivo.nombre}</strong>?
            </p>

            <p className="text-sm text-red-600 mb-4">
              Esta acción no se puede deshacer. Se eliminarán todos los datos asociados a esta grúa.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={cerrarDialogos}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarGrua}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de Historial */}
      {dialogType === 'historial' && selectedActivo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Historial de Cambios de Estado
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Grúa: <strong>{selectedActivo.nombre}</strong>
                </p>
              </div>
              <button
                onClick={cerrarDialogos}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Botones de Exportación */}
            {!historialLoading && historial.length > 0 && (
              <div className="flex gap-3 mb-4">
                <ExportButton
                  onExport={exportarHistorialExcel}
                  label="Exportar a Excel"
                  variant="primary"
                  icon="excel"
                  disabled={historial.length === 0}
                />
                <ExportButton
                  onExport={exportarHistorialCSV}
                  label="Exportar a CSV"
                  variant="secondary"
                  icon="csv"
                  disabled={historial.length === 0}
                />
              </div>
            )}

            {historialLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <p className="ml-3 text-gray-600">Cargando historial...</p>
              </div>
            ) : historial.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No hay historial de cambios disponible</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historial.map((item, index) => {
                  const fecha = new Date(item.fecha_cambio)
                  const esUltimo = index === historial.length - 1

                  return (
                    <div key={item.id} className="relative">
                      {/* Línea de conexión */}
                      {!esUltimo && (
                        <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gray-200"></div>
                      )}

                      <div className="flex gap-4">
                        {/* Ícono de estado */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          item.es_operativa
                            ? 'bg-green-100'
                            : 'bg-red-100'
                        }`}>
                          {item.es_operativa ? (
                            <Power className="w-5 h-5 text-green-600" />
                          ) : (
                            <PowerOff className="w-5 h-5 text-red-600" />
                          )}
                        </div>

                        {/* Contenido del cambio */}
                        <div className="flex-1 bg-gray-50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                item.es_operativa
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {item.es_operativa ? 'Activada' : 'Desactivada'}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">
                                {fecha.toLocaleDateString('es-CL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })}
                              </p>
                              <p className="text-xs text-gray-500">
                                {fecha.toLocaleTimeString('es-CL', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1">
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Usuario:</span>{' '}
                              {item.usuarios?.nombre_completo || 'No disponible'}
                            </p>
                            {item.motivo && (
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">Motivo:</span>{' '}
                                {item.motivo}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={cerrarDialogos}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}







