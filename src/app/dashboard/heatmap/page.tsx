'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { obtenerHeatmapGruas } from '@/lib/dashboard-service'
import { Heatmap, HeatmapData } from '@/components/Heatmap'

export default function HeatmapPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([])
  const [dias, setDias] = useState(30)

  const cargarHeatmap = useCallback(async () => {
    setLoading(true)
    const data = await obtenerHeatmapGruas(dias)
    setHeatmapData(data)
    setLoading(false)
  }, [dias])

  const checkAuthAndLoad = useCallback(async () => {
    const user = await getCurrentUser()

    if (!user || user.rol !== 'SUPERVISOR') {
      router.push('/login')
      return
    }

    await cargarHeatmap()
  }, [router, cargarHeatmap])

  // Verificar autenticación al montar
  useEffect(() => {
    checkAuthAndLoad()
  }, [checkAuthAndLoad])

  // Recargar datos cuando cambia el período (excluyendo la primera carga)
  useEffect(() => {
    // Solo ejecutar cuando dias cambie, no en el primer render
    const isFirstRender = heatmapData.length === 0 && loading
    if (!isFirstRender) {
      cargarHeatmap()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  function handleCellClick(activoId: number, fecha: string) {
    // Navegar a lista de reportes filtrada por grúa y fecha
    // Ahora usamos la misma fecha para inicio y fin, ya que el filtro incluye todo el día
    router.push(`/dashboard/reportes?activo=${activoId}&desde=${fecha}&hasta=${fecha}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando heatmap...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Heatmap de Performance</h1>
              <p className="text-sm text-gray-600">Score de cumplimiento por grúa y fecha</p>
            </div>

            {/* Selector de días */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Período:</label>
              <select
                value={dias}
                onChange={(e) => setDias(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="7">Últimos 7 días</option>
                <option value="14">Últimos 14 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="60">Últimos 60 días</option>
                <option value="90">Últimos 90 días</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Cómo usar el Heatmap</h3>
              <p className="text-sm text-blue-700 mt-1">
                • Los colores más verdes indican mejor performance (score alto)
                <br />
                • Los colores más rojos indican problemas (score bajo)
                <br />
                • Click en una celda para ver los reportes de ese día
                <br />
                • Las celdas grises indican que no hubo inspecciones ese día
              </p>
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-white rounded-lg shadow p-6">
          {heatmapData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay datos suficientes para mostrar el heatmap
            </div>
          ) : (
            <Heatmap data={heatmapData} onCellClick={handleCellClick} />
          )}
        </div>

        {/* Estadísticas Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Días con datos</h3>
            <p className="text-3xl font-bold text-gray-900">
              {Array.from(new Set(heatmapData.map(d => d.fecha))).length}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Grúas monitoreadas</h3>
            <p className="text-3xl font-bold text-gray-900">
              {Array.from(new Set(heatmapData.map(d => d.activo_nombre))).length}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total inspecciones</h3>
            <p className="text-3xl font-bold text-gray-900">
              {heatmapData.reduce((sum, d) => sum + d.total_inspecciones, 0)}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}