'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'

interface ExportButtonProps {
  onExport: () => Promise<void> | void
  label?: string
  variant?: 'primary' | 'secondary'
  icon?: 'excel' | 'csv'
  disabled?: boolean
  className?: string
}

/**
 * Botón de exportación con estado de carga interno; delega la lógica real a la función onExport
 * inyectada por el padre (Excel o CSV según variant).
 */
export default function ExportButton({
  onExport,
  label = 'Exportar',
  variant = 'primary',
  icon = 'excel',
  disabled = false,
  className = ''
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  // Envuelve la función de exportación en loading/error para que el padre no tenga que manejar el estado
  const handleExport = async () => {
    setLoading(true)
    try {
      await onExport()
    } catch (error) {
      console.error('Error al exportar:', error)
      alert('Error al exportar los datos')
    } finally {
      setLoading(false)
    }
  }

  const Icon = icon === 'excel' ? FileSpreadsheet : FileText

  const baseClasses = 'inline-flex items-center px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  const variantClasses = {
    primary: 'bg-green-600 text-white hover:bg-green-700',
    secondary: 'bg-blue-600 text-white hover:bg-blue-700'
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Exportando...
        </>
      ) : (
        <>
          <Icon className="w-4 h-4 mr-2" />
          {label}
        </>
      )}
    </button>
  )
}
