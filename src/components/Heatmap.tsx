'use client'

import { Forklift } from 'lucide-react'

export interface HeatmapData {
  activo_id: number
  activo_nombre: string
  fecha: string
  score_promedio: number
  total_inspecciones: number
  tiene_problemas: boolean
}

interface HeatmapProps {
  data: HeatmapData[]
  onCellClick?: (activoId: number, fecha: string) => void
}

/**
 * Grilla grúa × día coloreada por score de cumplimiento; cada celda es clickable para drilldown.
 * Limita las columnas a los últimos 30 días distintos presentes en los datos.
 */
export function Heatmap({ data, onCellClick }: HeatmapProps) {
  // Obtener grúas únicas
  const gruas = Array.from(new Set(data.map(d => d.activo_nombre))).sort()

  // Obtener fechas únicas ordenadas cronológicamente (más antigua a la izquierda)
  const fechas = Array.from(new Set(data.map(d => d.fecha))).sort().slice(-30)

  // Índice grua→fecha→celda para O(1) en lugar de Array.find por cada celda renderizada
  // Crear matriz de datos
  const matriz: Record<string, Record<string, HeatmapData | null>> = {}
  
  gruas.forEach(grua => {
    matriz[grua] = {}
    fechas.forEach(fecha => {
      const celda = data.find(d => d.activo_nombre === grua && d.fecha === fecha)
      matriz[grua][fecha] = celda || null
    })
  })

  // Mapea rangos de score a clases Tailwind: verde ≥95, amarillo 75-84, rojo <65
  function getColorByScore(score: number | null) {
    if (score === null) return 'bg-gray-100'
    if (score >= 95) return 'bg-green-500'
    if (score >= 85) return 'bg-green-400'
    if (score >= 75) return 'bg-yellow-400'
    if (score >= 65) return 'bg-orange-400'
    return 'bg-red-500'
  }

  // Parsea "YYYY-MM-DD" sin depender de la zona horaria del navegador (evita desfase de un día)
  function buildDateFromString(dateString: string) {
    const parts = dateString.split('-').map(Number)
    if (parts.length === 3 && parts.every(part => !Number.isNaN(part))) {
      const [year, month, day] = parts
      return new Date(year, month - 1, day)
    }
    return new Date(dateString)
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header con fechas */}
        <div className="flex">
          {/* Columna de grúas (fija) */}
          <div className="w-40 flex-shrink-0 bg-gray-50 border-r border-gray-200">
            <div className="h-12 flex items-center justify-center border-b border-gray-200 font-semibold text-gray-700">
              Grúas
            </div>
            <div className="flex flex-col gap-1 py-1">
              {gruas.map(grua => (
                <div
                  key={grua}
                  className="h-12 flex items-center px-3 text-sm font-medium text-gray-900"
                >
                  <Forklift className="w-4 h-4 mr-2 text-gray-400" />
                  {grua}
                </div>
              ))}
            </div>
          </div>

          {/* Columnas de fechas */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex">
              {fechas.map(fecha => {
                const fechaObj = buildDateFromString(fecha)
                const fechaCorta = fechaObj.toLocaleDateString('es-CL', {
                  day: '2-digit',
                  month: 'short'
                })

                return (
                  <div key={fecha} className="flex-shrink-0" style={{ width: '60px' }}>
                    {/* Header fecha */}
                    <div className="h-12 flex items-center justify-center border-b border-l border-gray-200 text-xs font-medium text-gray-700 bg-gray-50">
                      <div className="transform -rotate-45 whitespace-nowrap">
                        {fechaCorta}
                      </div>
                    </div>

                    {/* Celdas de cada grúa */}
                    {gruas.map(grua => {
                      const celda = matriz[grua][fecha]
                      const colorClass = getColorByScore(celda?.score_promedio || null)

                      return (
                        <button
                          key={`${grua}-${fecha}`}
                          onClick={() => celda && onCellClick?.(celda.activo_id, fecha)}
                          className={`h-12 w-full border-b border-l border-gray-200 ${colorClass} hover:opacity-80 transition-opacity relative group ${celda ? 'cursor-pointer' : 'cursor-default'}`}
                          title={celda ? `${grua} - ${fechaCorta}\nScore: ${celda.score_promedio}%\nInspecciones: ${celda.total_inspecciones}` : 'Sin datos'}
                        >
                          {celda && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-semibold text-white drop-shadow">
                                {Math.round(celda.score_promedio)}
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Leyenda */}
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <span className="font-medium text-gray-700">Leyenda:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-600">95-100%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-400 rounded"></div>
            <span className="text-gray-600">85-94%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-400 rounded"></div>
            <span className="text-gray-600">75-84%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-400 rounded"></div>
            <span className="text-gray-600">65-74%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-gray-600">&lt;65%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-gray-600">Sin datos</span>
          </div>
        </div>
      </div>
    </div>
  )
}
