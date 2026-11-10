import { LucideIcon } from 'lucide-react'

/**
 * Tarjeta de métrica reutilizable; se renderiza como <button> clickable o <div> estático
 * según las props clickable y onClick.
 */
interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  onClick?: () => void
  clickable?: boolean
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  onClick,
  clickable = false 
}: KPICardProps) {
  const CardContent = () => (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        )}
        {trend && (
          <p className={`mt-2 text-sm font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </p>
        )}
      </div>
      <div className="ml-4">
        <div className="bg-blue-50 rounded-full p-3">
          <Icon className="w-6 h-6 text-blue-600" />
        </div>
      </div>
    </div>
  )

  // Versión interactiva: envuelve el contenido en un botón para accesibilidad y navegación
  if (clickable && onClick) {
    return (
      <button
        onClick={onClick}
        className="bg-white rounded-lg shadow p-6 w-full text-left hover:shadow-lg transition-shadow cursor-pointer hover:bg-gray-50"
      >
        <CardContent />
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <CardContent />
    </div>
  )
}