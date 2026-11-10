'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Sparkles, X, Send, Database, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Consulta = { herramienta: string; etiqueta: string; filas: number | null }
type Mensaje = { rol: 'user' | 'model'; texto: string; consultas?: Consulta[]; error?: boolean }

const SUGERENCIAS = [
  '¿Qué grúa tuvo más fallas de frenos este mes y quién las reportó?',
  'Compara GH-03 con GH-05 en los últimos 30 días',
  '¿Qué grúas no se inspeccionaron ayer?',
  '¿Qué operadores tienen horómetros pendientes de cierre?',
  '¿En qué turno se detectan más fallas?',
]

// --- Render mínimo de Markdown (negritas, listas, tablas y enlaces internos) ---
function enLinea(texto: string, clave: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]+)\)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index))
    if (m[1]) out.push(<strong key={`${clave}-b${i++}`}>{m[1]}</strong>)
    else out.push(<Link key={`${clave}-l${i++}`} href={m[3]} className="text-blue-600 underline">{m[2]}</Link>)
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo))
  return out
}

function Markdown({ texto }: { texto: string }) {
  const lineas = texto.split('\n')
  const bloques: ReactNode[] = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i].trim()
    if (l.startsWith('|')) {
      const filas: string[][] = []
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        if (!celdas.every(c => /^:?-{2,}:?$/.test(c))) filas.push(celdas)
        i++
      }
      const [cab, ...cuerpo] = filas
      bloques.push(
        <div key={`t${i}`} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            <thead><tr>{cab?.map((c, k) => <th key={k} className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">{enLinea(c, `h${i}${k}`)}</th>)}</tr></thead>
            <tbody>{cuerpo.map((f, r) => <tr key={r}>{f.map((c, k) => <td key={k} className="border border-gray-200 px-2 py-1">{enLinea(c, `c${i}${r}${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^[-*•]\s+/.test(l)) {
      const items: string[] = []
      while (i < lineas.length && /^[-*•]\s+/.test(lineas[i].trim())) { items.push(lineas[i].trim().replace(/^[-*•]\s+/, '')); i++ }
      bloques.push(<ul key={`u${i}`} className="list-disc pl-5 my-1 space-y-0.5">{items.map((it, k) => <li key={k}>{enLinea(it, `li${i}${k}`)}</li>)}</ul>)
      continue
    }
    if (l) bloques.push(<p key={`p${i}`} className="my-1">{enLinea(l.replace(/^#+\s*/, ''), `p${i}`)}</p>)
    i++
  }
  return <div className="text-sm leading-relaxed text-gray-800">{bloques}</div>
}

export default function AsistenteIA() {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, cargando])

  async function preguntar(pregunta: string) {
    const p = pregunta.trim()
    if (!p || cargando) return
    const historial = mensajes.filter(m => !m.error).map(m => ({ rol: m.rol, texto: m.texto }))
    setMensajes(prev => [...prev, { rol: 'user', texto: p }])
    setTexto('')
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ pregunta: p, historial }),
      })
      const d = await r.json()
      setMensajes(prev => [...prev, d.respuesta
        ? { rol: 'model', texto: d.respuesta, consultas: d.consultas }
        : { rol: 'model', texto: d.error ?? 'Ocurrió un error.', error: true }])
    } catch {
      setMensajes(prev => [...prev, { rol: 'model', texto: 'No hay conexión con el asistente.', error: true }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-3 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition"
        >
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold">Pregúntale a tus datos</span>
        </button>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setAbierto(false)}>
          <aside
            onClick={e => e.stopPropagation()}
            className="flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl"
            aria-label="Asistente con IA"
          >
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-teal-50 p-2"><Sparkles className="h-5 w-5 text-teal-600" /></div>
                <div>
                  <h2 className="font-semibold text-gray-900">Asistente de datos</h2>
                  <p className="text-xs text-gray-500">IA · Gemini · consultas de solo lectura</p>
                </div>
              </div>
              <button onClick={() => setAbierto(false)} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {mensajes.length === 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Hazle preguntas sobre las inspecciones en lenguaje natural. La IA consulta los datos y te responde con cifras.
                  </p>
                  <div className="space-y-2">
                    {SUGERENCIAS.map(s => (
                      <button key={s} onClick={() => preguntar(s)}
                        className="w-full rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-left text-sm text-teal-900 hover:bg-teal-100">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => m.rol === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">{m.texto}</div>
                </div>
              ) : (
                <div key={i} className={`rounded-2xl rounded-bl-sm border px-3 py-2 ${m.error ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                  <Markdown texto={m.texto} />
                  {m.consultas && m.consultas.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        <Database className="h-3 w-3" /> Datos consultados
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {m.consultas.map((c, k) => (
                          <span key={k} className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                            {c.etiqueta}{c.filas !== null ? ` (${c.filas})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {cargando && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consultando los datos…
                </div>
              )}
              <div ref={finRef} />
            </div>

            <form onSubmit={e => { e.preventDefault(); preguntar(texto) }} className="border-t p-3">
              <div className="flex gap-2">
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  maxLength={500}
                  placeholder="Ej: ¿cuántas fallas de neumáticos hubo en octubre?"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button type="submit" disabled={cargando || !texto.trim()}
                  className="rounded-lg bg-teal-600 px-3 text-white disabled:opacity-40" aria-label="Enviar">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Respuestas generadas con IA a partir de consultas de solo lectura. Verifica las cifras importantes.
              </p>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
