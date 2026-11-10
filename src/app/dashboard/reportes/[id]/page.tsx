'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Forklift,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Image as ImageIcon,
  Timer,
  Download,
  FileImage
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { obtenerReporteDetalle, ReporteDetalle } from '@/lib/reportes-service'
import ExportButton from '@/components/ExportButton'
import {
  exportarAExcelMultiplesHojas,
  exportarACSV,
  generarNombreArchivo,
  formatearFechaExcel,
  formatearFechaSoloExcel,
  formatearPorcentaje,
  calcularAntiguedad
} from '@/lib/export-utils'
import { exportarReporteConFotos } from '@/lib/pdf-export-utils'

export default function ReporteDetallePage() {
  const router = useRouter()
  const params = useParams()
  const reporteId = params.id as string

  const [loading, setLoading] = useState(true)
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null)
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const cargarReporte = useCallback(async () => {
    const data = await obtenerReporteDetalle(reporteId)
    setReporte(data)
  }, [reporteId])

  const checkAuthAndLoad = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    await cargarReporte()
    setLoading(false)
  }, [router, cargarReporte])

  useEffect(() => {
    checkAuthAndLoad()
  }, [checkAuthAndLoad])

  async function descargarImagen(url: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `foto-reporte-${reporteId}-${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Error descargando imagen:', error)
      alert('Error al descargar la imagen')
    }
  }

  async function exportarReporteCSV() {
    if (!reporte) {
      alert('No hay reporte para exportar')
      return
    }

    // Formato CSV: Una fila por respuesta con todos los datos
    const datosCSV = reporte.respuestas.map((resp) => ({
      'ID Reporte': reporte.id,
      'Fecha/Hora Completado': formatearFechaExcel(reporte.timestamp_completado),
      'Duración (min)': reporte.duracion_minutos,
      'Turno': reporte.turno ? `Turno ${reporte.turno}` : '-',
      'Grúa': reporte.activo.nombre,
      'Modelo Grúa': reporte.activo.modelo,
      'Tipo Grúa': reporte.activo.tipo,
      'Operador': reporte.usuario.nombre_completo,
      'RUT Operador': reporte.usuario.rut || '-',
      'ID Alternativo': reporte.usuario.id_alternativo || '-',
      'Centro Costo': reporte.usuario.centro_costo || '-',
      'Cargo': reporte.usuario.cargo || '-',
      'Fecha Ingreso': formatearFechaSoloExcel(reporte.usuario.fecha_ingreso),
      'Antigüedad': calcularAntiguedad(reporte.usuario.fecha_ingreso),
      'Horómetro Inicial': reporte.horometro_inicial !== null ? `${reporte.horometro_inicial}h` : '-',
      'Horómetro Final': reporte.horometro_final !== null ? `${reporte.horometro_final}h` : '-',
      'Horas Uso': reporte.horas_uso !== null ? `${reporte.horas_uso}h` : '-',
      'Score': formatearPorcentaje(reporte.score_cumplimiento, 2),
      'Categoría': resp.pregunta.categoria.nombre,
      'Orden Pregunta': resp.pregunta.orden,
      'Pregunta': resp.pregunta.texto,
      'Respuesta': resp.respuesta ? 'BUENO' : 'MALO',
      'Comentario': resp.comentario || '-',
      'Cantidad Fotos': resp.fotos?.length || 0,
      'URLs Fotos': resp.fotos?.length > 0
        ? resp.fotos.map(f => f.url_storage).join(' | ')
        : '-'
    })).sort((a, b) => a['Orden Pregunta'] - b['Orden Pregunta'])

    const nombreArchivo = generarNombreArchivo(`reporte_${reporte.activo.nombre}_${reporte.id.substring(0, 8)}`, 'csv')
    exportarACSV(datosCSV, nombreArchivo)
  }

  async function exportarReporteCompleto() {
    if (!reporte) {
      alert('No hay reporte para exportar')
      return
    }

    // Hoja 1: Información General
    const infoGeneral = [
      {
        'Campo': 'ID Reporte',
        'Valor': reporte.id
      },
      {
        'Campo': 'Fecha/Hora Completado',
        'Valor': formatearFechaExcel(reporte.timestamp_completado)
      },
      {
        'Campo': 'Fecha/Hora Inicio',
        'Valor': formatearFechaExcel(reporte.timestamp_inicio)
      },
      {
        'Campo': 'Duración',
        'Valor': `${reporte.duracion_minutos} minutos`
      },
      {
        'Campo': 'Turno',
        'Valor': reporte.turno ? `Turno ${reporte.turno}` : '-'
      },
      {
        'Campo': '',
        'Valor': ''
      },
      {
        'Campo': 'GRÚA',
        'Valor': ''
      },
      {
        'Campo': 'Nombre',
        'Valor': reporte.activo.nombre
      },
      {
        'Campo': 'Modelo',
        'Valor': reporte.activo.modelo
      },
      {
        'Campo': 'Tipo',
        'Valor': reporte.activo.tipo
      },
      {
        'Campo': '',
        'Valor': ''
      },
      {
        'Campo': 'OPERADOR',
        'Valor': ''
      },
      {
        'Campo': 'ID Usuario',
        'Valor': reporte.usuario.id
      },
      {
        'Campo': 'Nombre Completo',
        'Valor': reporte.usuario.nombre_completo
      },
      {
        'Campo': 'Rol',
        'Valor': reporte.usuario.rol
      },
      {
        'Campo': 'RUT',
        'Valor': reporte.usuario.rut || '-'
      },
      {
        'Campo': 'ID Alternativo',
        'Valor': reporte.usuario.id_alternativo || '-'
      },
      {
        'Campo': 'Centro de Costo',
        'Valor': reporte.usuario.centro_costo || '-'
      },
      {
        'Campo': 'Cargo',
        'Valor': reporte.usuario.cargo || '-'
      },
      {
        'Campo': 'Fecha Ingreso',
        'Valor': formatearFechaSoloExcel(reporte.usuario.fecha_ingreso)
      },
      {
        'Campo': 'Antigüedad',
        'Valor': calcularAntiguedad(reporte.usuario.fecha_ingreso)
      },
      {
        'Campo': 'Fecha Creación Usuario',
        'Valor': formatearFechaExcel(reporte.usuario.created_at)
      },
      {
        'Campo': '',
        'Valor': ''
      },
      {
        'Campo': 'HORÓMETROS',
        'Valor': ''
      },
      {
        'Campo': 'Horómetro Inicial',
        'Valor': reporte.horometro_inicial !== null ? `${reporte.horometro_inicial}h` : '-'
      },
      {
        'Campo': 'Horómetro Final',
        'Valor': reporte.horometro_final !== null ? `${reporte.horometro_final}h` : '-'
      },
      {
        'Campo': 'Horas de Uso',
        'Valor': reporte.horas_uso !== null ? `${reporte.horas_uso}h` : '-'
      },
      {
        'Campo': '',
        'Valor': ''
      },
      {
        'Campo': 'RESULTADOS',
        'Valor': ''
      },
      {
        'Campo': 'Score de Cumplimiento',
        'Valor': formatearPorcentaje(reporte.score_cumplimiento, 2)
      },
      {
        'Campo': 'Total Items',
        'Valor': reporte.total_respuestas.toString()
      },
      {
        'Campo': 'Items Buenos',
        'Valor': (reporte.total_respuestas - reporte.respuestas_malas).toString()
      },
      {
        'Campo': 'Items Malos',
        'Valor': reporte.respuestas_malas.toString()
      },
      {
        'Campo': 'Tiene Problemas',
        'Valor': reporte.tiene_problemas ? 'Sí' : 'No'
      }
    ]

    // Hoja 2: Respuestas Detalladas
    const respuestasDetalladas = reporte.respuestas.map((resp) => ({
      'Categoría': resp.pregunta.categoria.nombre,
      'Orden': resp.pregunta.orden,
      'Pregunta': resp.pregunta.texto,
      'Respuesta': resp.respuesta ? 'BUENO' : 'MALO',
      'Comentario': resp.comentario || '-',
      'Cantidad Fotos': resp.fotos?.length || 0,
      'URLs Fotos': resp.fotos?.length > 0
        ? resp.fotos.map(f => f.url_storage).join(' | ')
        : '-'
    })).sort((a, b) => a.Orden - b.Orden)

    // Hoja 3: Resumen por Categoría
    const respuestasPorCategoria = reporte.respuestas.reduce((acc, resp) => {
      const categoria = resp.pregunta.categoria.nombre
      if (!acc[categoria]) {
        acc[categoria] = { total: 0, buenas: 0, malas: 0 }
      }
      acc[categoria].total++
      if (resp.respuesta) {
        acc[categoria].buenas++
      } else {
        acc[categoria].malas++
      }
      return acc
    }, {} as Record<string, { total: number; buenas: number; malas: number }>)

    const resumenPorCategoria = Object.entries(respuestasPorCategoria).map(([categoria, stats]) => ({
      'Categoría': categoria,
      'Total Preguntas': stats.total,
      'Buenas': stats.buenas,
      'Malas': stats.malas,
      '% Cumplimiento': formatearPorcentaje((stats.buenas / stats.total) * 100, 1)
    }))

    // Exportar con múltiples hojas
    const hojas = [
      { nombre: 'Información General', datos: infoGeneral },
      { nombre: 'Respuestas Detalladas', datos: respuestasDetalladas },
      { nombre: 'Resumen por Categoría', datos: resumenPorCategoria }
    ]

    const nombreArchivo = generarNombreArchivo(`reporte_${reporte.activo.nombre}_${reporte.id.substring(0, 8)}`, 'xlsx')
    exportarAExcelMultiplesHojas(hojas, nombreArchivo)
  }

  async function exportarReporteConFotosPDF() {
    if (!reporte) {
      alert('No hay reporte para exportar')
      return
    }

    // Verificar si hay respuestas malas (con o sin fotos)
    const respuestasMalas = reporte.respuestas.filter((resp) => !resp.respuesta)

    // Informar al usuario si no hay fotos pero sí hay preguntas malas
    if (respuestasMalas.length > 0) {
      const respuestasConFotos = respuestasMalas.filter(
        (resp) => resp.fotos && resp.fotos.length > 0
      )

      if (respuestasConFotos.length === 0) {
        const confirmar = confirm(
          `Este reporte tiene ${respuestasMalas.length} pregunta(s) mala(s) pero no tiene fotos. ¿Desea continuar con la exportación?`
        )
        if (!confirmar) return
      }
    }

    setExportandoPDF(true)
    try {
      await exportarReporteConFotos(reporte)
    } catch (error) {
      console.error('Error exportando reporte con fotos:', error)
      alert('Error al exportar el reporte con fotos. Por favor, intente nuevamente.')
    } finally {
      setExportandoPDF(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando reporte...</p>
        </div>
      </div>
    )
  }

  if (!reporte) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Reporte no encontrado</h2>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    )
  }

  const fecha = new Date(reporte.timestamp_completado).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // Agrupar respuestas por categoría
  const respuestasPorCategoria = reporte.respuestas.reduce((acc, resp) => {
    const categoria = resp.pregunta.categoria.nombre
    if (!acc[categoria]) {
      acc[categoria] = []
    }
    acc[categoria].push(resp)
    return acc
  }, {} as Record<string, typeof reporte.respuestas>)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Dashboard
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => router.push('/dashboard/reportes')}
              className="flex items-center text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Reportes
            </button>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Detalle de Inspección</h1>
            <div className="flex items-center gap-3">
              <ExportButton
                onExport={exportarReporteCompleto}
                label="Exportar a Excel"
                variant="primary"
                icon="excel"
              />
              <ExportButton
                onExport={exportarReporteCSV}
                label="Exportar a CSV"
                variant="secondary"
                icon="csv"
              />
              <button
                onClick={exportarReporteConFotosPDF}
                disabled={exportandoPDF}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exportandoPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileImage className="w-4 h-4" />
                    Exportar PDF con Fotos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Información General */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Información General</h2>
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                reporte.tiene_problemas 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {reporte.tiene_problemas ? (
                  <>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Con Problemas
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Sin Problemas
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-start space-x-3">
              <Forklift className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Grúa</p>
                <p className="font-semibold text-gray-900">{reporte.activo.nombre}</p>
                <p className="text-sm text-gray-500">{reporte.activo.modelo}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Operador</p>
                <p className="font-semibold text-gray-900">{reporte.usuario.nombre_completo}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Fecha y Hora</p>
                <p className="font-semibold text-gray-900">{fecha}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Timer className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Duración</p>
                <p className="font-semibold text-gray-900">{reporte.duracion_minutos} minutos</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Turno</p>
                <p className="font-semibold text-gray-900">
                  {reporte.turno ? `Turno ${reporte.turno}` : 'No especificado'}
                </p>
              </div>
            </div>

            {reporte.horometro_inicial !== null && (
              <div className="flex items-start space-x-3">
                <Timer className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">Horómetro</p>
                  <p className="font-semibold text-gray-900">
                    Inicial: {reporte.horometro_inicial}h
                  </p>
                  {reporte.horometro_final && (
                    <p className="text-sm text-gray-500">
                      Final: {reporte.horometro_final}h ({reporte.horas_uso}h uso)
                    </p>
                  )}
                  {reporte.horometro_pendiente && (
                    <span className="inline-block mt-1 text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                      Pendiente de cierre
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Resultado</h3>
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">{reporte.score_cumplimiento}%</p>
              <p className="text-sm text-gray-500">Score de Cumplimiento</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{reporte.total_respuestas}</p>
              <p className="text-sm text-gray-500">Total Items</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {reporte.total_respuestas - reporte.respuestas_malas}
              </p>
              <p className="text-sm text-green-600">Buenos</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{reporte.respuestas_malas}</p>
              <p className="text-sm text-red-600">Malos</p>
            </div>
          </div>
        </div>

        {/* Respuestas por Categoría */}
        <div className="space-y-6">
          {Object.entries(respuestasPorCategoria).map(([categoria, respuestas]) => (
            <div key={categoria} className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{categoria}</h3>
              </div>
              
              <div className="divide-y divide-gray-200">
                {respuestas
                  .sort((a, b) => a.pregunta.orden - b.pregunta.orden)
                  .map((resp) => (
                    <div key={resp.id} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium mb-2">{resp.pregunta.texto}</p>
                          
                          {resp.comentario && (
                            <div className="mt-2 flex items-start space-x-2 text-sm">
                              <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <p className="text-gray-600 italic">{resp.comentario}</p>
                            </div>
                          )}

                          {resp.fotos && resp.fotos.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {resp.fotos.map((foto, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setImagenAmpliada(foto.url_storage)}
                                  className="group relative w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-colors"
                                >
                                  <Image
                                    src={foto.url_storage}
                                    alt={`Foto ${idx + 1}`}
                                    fill
                                    sizes="80px"
                                    className="object-cover"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                    <ImageIcon className="w-5 h-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <span className={`ml-4 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium flex-shrink-0 ${
                          resp.respuesta 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {resp.respuesta ? 'BUENO' : 'MALO'}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal de Imagen Ampliada */}
      {imagenAmpliada && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setImagenAmpliada(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                descargarImagen(imagenAmpliada)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar
            </button>
            <button
              className="text-white text-xl font-bold hover:text-gray-300 p-2"
              onClick={() => setImagenAmpliada(null)}
            >
              ✕
            </button>
          </div>
          <div className="relative w-full h-full flex items-center justify-center">
            <Image
              src={imagenAmpliada}
              alt="Imagen ampliada"
              width={1200}
              height={800}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}