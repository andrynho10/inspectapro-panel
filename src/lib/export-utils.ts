import * as XLSX from 'xlsx'

/**
 * Genera un nombre de archivo con timestamp
 */
export function generarNombreArchivo(prefijo: string, extension: 'xlsx' | 'csv'): string {
  const ahora = new Date()
  const fecha = ahora.toISOString().split('T')[0].replace(/-/g, '')
  const hora = ahora.toTimeString().split(' ')[0].replace(/:/g, '')
  return `${prefijo}_${fecha}_${hora}.${extension}`
}

/**
 * Formatea una fecha en formato DD/MM/YYYY HH:mm
 */
export function formatearFechaExcel(fecha: string | Date | null | undefined): string {
  if (!fecha) return '-'

  const date = typeof fecha === 'string' ? new Date(fecha) : fecha

  if (isNaN(date.getTime())) return '-'

  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

/**
 * Formatea una fecha solo en formato DD/MM/YYYY
 */
export function formatearFechaSoloExcel(fecha: string | Date | null | undefined): string {
  if (!fecha) return '-'

  const date = typeof fecha === 'string' ? new Date(fecha) : fecha

  if (isNaN(date.getTime())) return '-'

  return date.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

/**
 * Formatea un número con separadores de miles
 */
export function formatearNumero(numero: number | null | undefined): string {
  if (numero === null || numero === undefined) return '-'
  return numero.toLocaleString('es-CL')
}

/**
 * Formatea un porcentaje
 */
export function formatearPorcentaje(numero: number | null | undefined, decimales: number = 1): string {
  if (numero === null || numero === undefined) return '-'
  return `${numero.toFixed(decimales)}%`
}

/**
 * Calcula la antigüedad en años y meses desde una fecha
 */
export function calcularAntiguedad(fechaIngreso: string | Date | null | undefined): string {
  if (!fechaIngreso) return '-'

  const fecha = typeof fechaIngreso === 'string' ? new Date(fechaIngreso) : fechaIngreso

  if (isNaN(fecha.getTime())) return '-'

  const ahora = new Date()
  const diffMs = ahora.getTime() - fecha.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const years = Math.floor(diffDays / 365)
  const months = Math.floor((diffDays % 365) / 30)

  if (years === 0 && months === 0) return 'Menos de 1 mes'
  if (years === 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  if (months === 0) return `${years} ${years === 1 ? 'año' : 'años'}`

  return `${years} ${years === 1 ? 'año' : 'años'} y ${months} ${months === 1 ? 'mes' : 'meses'}`
}

/**
 * Exporta datos a un archivo Excel
 */
export function exportarAExcel(data: Array<Record<string, unknown>>, nombreArchivo: string, nombreHoja: string = 'Datos') {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, nombreHoja)

  // Ajustar ancho de columnas automáticamente
  const maxWidth = 50
  const colWidths = Object.keys(data[0]).map(key => {
    const maxLength = Math.max(
      key.length,
      ...data.map(row => String(row[key] || '').length)
    )
    return { wch: Math.min(maxLength + 2, maxWidth) }
  })
  worksheet['!cols'] = colWidths

  XLSX.writeFile(workbook, nombreArchivo)
}

/**
 * Exporta datos a un archivo Excel con múltiples hojas; omite hojas vacías para evitar errores de XLSX
 */
export function exportarAExcelMultiplesHojas(
  hojas: Array<{ nombre: string; datos: Array<Record<string, unknown>> }>,
  nombreArchivo: string
) {
  if (!hojas || hojas.length === 0) {
    alert('No hay datos para exportar')
    return
  }

  const workbook = XLSX.utils.book_new()

  hojas.forEach(hoja => {
    if (hoja.datos && hoja.datos.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(hoja.datos)

      // Ajustar ancho de columnas automáticamente
      const maxWidth = 50
      const colWidths = Object.keys(hoja.datos[0]).map(key => {
        const maxLength = Math.max(
          key.length,
          ...hoja.datos.map(row => String(row[key] || '').length)
        )
        return { wch: Math.min(maxLength + 2, maxWidth) }
      })
      worksheet['!cols'] = colWidths

      XLSX.utils.book_append_sheet(workbook, worksheet, hoja.nombre)
    }
  })

  XLSX.writeFile(workbook, nombreArchivo)
}

/**
 * Exporta datos a CSV usando XLSX como intermediario para garantizar encoding correcto;
 * dispara descarga mediante un <a> temporal en el DOM
 */
export function exportarACSV(data: Array<Record<string, unknown>>, nombreArchivo: string) {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(worksheet)

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', nombreArchivo)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
