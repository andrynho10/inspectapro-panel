
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

// Valores que Excel interpretaría como fórmula (=, +, -, @) se neutralizan con un apóstrofo:
// evita "CSV/Formula injection" si algún dato de usuario empieza con esos caracteres
function sanear(valor: unknown): string | number | boolean | Date | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number' || typeof valor === 'boolean' || valor instanceof Date) return valor
  const texto = String(valor)
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
}

function descargar(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Hoja = { nombre: string; datos: Array<Record<string, unknown>> }

async function construirLibro(hojas: Hoja[]) {
  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  libro.creator = 'InspectaPro'
  libro.created = new Date()
  for (const hoja of hojas) {
    if (!hoja.datos || hoja.datos.length === 0) continue
    // Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
    const nombre = hoja.nombre.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Datos'
    const ws = libro.addWorksheet(nombre)
    const columnas = Object.keys(hoja.datos[0])
    ws.columns = columnas.map(key => ({
      header: key,
      key,
      width: Math.min(Math.max(key.length, ...hoja.datos.map(r => String(r[key] ?? '').length)) + 2, 50),
    }))
    hoja.datos.forEach(fila => ws.addRow(Object.fromEntries(columnas.map(c => [c, sanear(fila[c])]))))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const buffer = await libro.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * Exporta datos a un archivo Excel
 */
export async function exportarAExcel(data: Array<Record<string, unknown>>, nombreArchivo: string, nombreHoja: string = 'Datos') {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar')
    return
  }
  descargar(await construirLibro([{ nombre: nombreHoja, datos: data }]), nombreArchivo)
}

/**
 * Exporta datos a un archivo Excel con múltiples hojas; omite hojas vacías
 */
export async function exportarAExcelMultiplesHojas(hojas: Hoja[], nombreArchivo: string) {
  if (!hojas || hojas.length === 0 || hojas.every(h => !h.datos || h.datos.length === 0)) {
    alert('No hay datos para exportar')
    return
  }
  descargar(await construirLibro(hojas), nombreArchivo)
}

/**
 * Exporta datos a CSV (UTF-8 con BOM para que Excel respete tildes y ñ)
 */
export function exportarACSV(data: Array<Record<string, unknown>>, nombreArchivo: string) {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar')
    return
  }
  const columnas = Object.keys(data[0])
  const celda = (v: unknown) => {
    const t = sanear(v)
    const s = t === null ? '' : t instanceof Date ? t.toISOString() : String(t)
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lineas = [columnas.map(celda).join(','), ...data.map(f => columnas.map(c => celda(f[c])).join(','))]
  descargar(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), nombreArchivo)
}
