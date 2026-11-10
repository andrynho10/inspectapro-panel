'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Mail, Smartphone, ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type Activo = {
  id: number
  nombre: string
  modelo: string
  tipo: string
}

type DestinatarioEmail = {
  id: number
  email: string
  nombre: string
  activo: boolean
  tipo: string
  gruas_asignadas: number[]
}

type Supervisor = {
  id: string
  nombre_completo: string
  rut: string | null
  gruas_asignadas: number[]
}

export default function NotificacionesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activos, setActivos] = useState<Activo[]>([])
  const [destinatariosEmail, setDestinatariosEmail] = useState<DestinatarioEmail[]>([])
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [activeTab, setActiveTab] = useState<'email' | 'push'>('email')

  // Nuevo destinatario de email
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        router.push('/login')
        return
      }
      await cargarDatos()
    }
    checkAuth()
  }, [router])

  const cargarDatos = async () => {
    try {
      setLoading(true)

      // Cargar activos (grúas)
      const { data: activosData, error: activosError } = await supabase
        .from('activos')
        .select('id, nombre, modelo, tipo')
        .order('nombre')

      if (activosError) throw activosError
      setActivos(activosData || [])

      // Cargar destinatarios de email con sus grúas asignadas
      const { data: emailData, error: emailError } = await supabase
        .from('email_destinatarios')
        .select('id, email, nombre, activo, tipo')
        .order('nombre')

      if (emailError) throw emailError

      // Para cada destinatario, obtener sus grúas asignadas
      const destinatariosConGruas = await Promise.all(
        (emailData || []).map(async (dest) => {
          const { data: asignaciones } = await supabase
            .from('email_destinatarios_activos')
            .select('activo_id')
            .eq('email_destinatario_id', dest.id)

          return {
            ...dest,
            gruas_asignadas: asignaciones?.map((a) => a.activo_id) || []
          }
        })
      )
      setDestinatariosEmail(destinatariosConGruas)

      // Cargar supervisores con sus grúas asignadas
      const { data: supervisoresData, error: supervisoresError } = await supabase
        .from('usuarios')
        .select('id, nombre_completo, rut')
        .eq('rol', 'SUPERVISOR')
        .order('nombre_completo')

      if (supervisoresError) throw supervisoresError

      // Para cada supervisor, obtener sus grúas asignadas
      const supervisoresConGruas = await Promise.all(
        (supervisoresData || []).map(async (sup) => {
          const { data: asignaciones } = await supabase
            .from('supervisores_activos')
            .select('activo_id')
            .eq('usuario_id', sup.id)

          return {
            ...sup,
            gruas_asignadas: asignaciones?.map((a) => a.activo_id) || []
          }
        })
      )
      setSupervisores(supervisoresConGruas)
    } catch (error) {
      console.error('Error cargando datos:', error)
      alert('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const toggleGruaEmail = (destinatarioId: number, activoId: number) => {
    setDestinatariosEmail(prevDestinatarios =>
      prevDestinatarios.map(dest =>
        dest.id === destinatarioId
          ? {
              ...dest,
              gruas_asignadas: dest.gruas_asignadas.includes(activoId)
                ? dest.gruas_asignadas.filter(id => id !== activoId)
                : [...dest.gruas_asignadas, activoId]
            }
          : dest
      )
    )
  }

  const toggleGruaSupervisor = (supervisorId: string, activoId: number) => {
    setSupervisores(prevSupervisores =>
      prevSupervisores.map(sup =>
        sup.id === supervisorId
          ? {
              ...sup,
              gruas_asignadas: sup.gruas_asignadas.includes(activoId)
                ? sup.gruas_asignadas.filter(id => id !== activoId)
                : [...sup.gruas_asignadas, activoId]
            }
          : sup
      )
    )
  }

  const agregarDestinatarioEmail = async () => {
    if (!nuevoEmail || !nuevoNombre) {
      alert('Por favor completa todos los campos')
      return
    }

    try {
      const { data, error } = await supabase
        .from('email_destinatarios')
        .insert({
          email: nuevoEmail,
          nombre: nuevoNombre,
          activo: true,
          tipo: 'supervisor'
        })
        .select()
        .single()

      if (error) throw error

      setDestinatariosEmail([...destinatariosEmail, { ...data, gruas_asignadas: [] }])
      setNuevoEmail('')
      setNuevoNombre('')
    } catch (error) {
      console.error('Error agregando destinatario:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      alert('Error al agregar destinatario: ' + errorMessage)
    }
  }

  const eliminarDestinatarioEmail = async (id: number) => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      alert('En la versión demo no se pueden eliminar datos')
      return
    }
    if (!confirm('¿Estás seguro de eliminar este destinatario?')) return

    try {
      const { error } = await supabase
        .from('email_destinatarios')
        .delete()
        .eq('id', id)

      if (error) throw error

      setDestinatariosEmail(destinatariosEmail.filter(d => d.id !== id))
    } catch (error) {
      console.error('Error eliminando destinatario:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      alert('Error al eliminar destinatario: ' + errorMessage)
    }
  }

  const guardarConfiguracion = async () => {
    try {
      setSaving(true)

      if (activeTab === 'email') {
        // Guardar configuración de emails
        for (const dest of destinatariosEmail) {
          // Eliminar todas las asignaciones existentes
          await supabase
            .from('email_destinatarios_activos')
            .delete()
            .eq('email_destinatario_id', dest.id)

          // Insertar las nuevas asignaciones
          if (dest.gruas_asignadas.length > 0) {
            const asignaciones = dest.gruas_asignadas.map(activoId => ({
              email_destinatario_id: dest.id,
              activo_id: activoId
            }))

            await supabase
              .from('email_destinatarios_activos')
              .insert(asignaciones)
          }
        }
      } else {
        // Guardar configuración de supervisores
        for (const sup of supervisores) {
          // Eliminar todas las asignaciones existentes
          await supabase
            .from('supervisores_activos')
            .delete()
            .eq('usuario_id', sup.id)

          // Insertar las nuevas asignaciones
          if (sup.gruas_asignadas.length > 0) {
            const asignaciones = sup.gruas_asignadas.map(activoId => ({
              usuario_id: sup.id,
              activo_id: activoId
            }))

            await supabase
              .from('supervisores_activos')
              .insert(asignaciones)
          }
        }
      }

      alert('Configuración guardada exitosamente')
    } catch (error) {
      console.error('Error guardando configuración:', error)
      alert('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-6 h-6 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Settings className="w-8 h-8 text-blue-600" />
                  Configuración de Notificaciones
                </h1>
                <p className="text-gray-600 mt-1">
                  Configura qué grúas debe monitorear cada persona
                </p>
              </div>
            </div>
            <button
              onClick={guardarConfiguracion}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800 text-sm">
            <strong>Nota:</strong> Si una persona no tiene grúas asignadas, recibirá notificaciones de <strong>TODAS</strong> las grúas.
            Si deseas que solo reciba de ciertas grúas, selecciónalas a continuación.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('email')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-semibold transition-colors cursor-pointer ${
                activeTab === 'email'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Mail className="w-5 h-5" />
              Notificaciones por Email
            </button>
            <button
              onClick={() => setActiveTab('push')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-semibold transition-colors cursor-pointer ${
                activeTab === 'push'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              Notificaciones Push (Móvil)
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'email' ? (
              <div className="space-y-6">
                {/* Agregar nuevo destinatario */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Agregar Nuevo Destinatario
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={nuevoEmail}
                      onChange={(e) => setNuevoEmail(e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={agregarDestinatarioEmail}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 justify-center cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                      Agregar
                    </button>
                  </div>
                </div>

                {/* Lista de destinatarios */}
                <div className="space-y-4">
                  {destinatariosEmail.map((dest) => (
                    <div key={dest.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{dest.nombre}</h3>
                          <p className="text-sm text-gray-600">{dest.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {dest.gruas_asignadas.length === 0 ? (
                              <span className="text-blue-600 font-medium">Recibe de TODAS las grúas</span>
                            ) : (
                              `${dest.gruas_asignadas.length} grúa(s) asignada(s)`
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => eliminarDestinatarioEmail(dest.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar destinatario"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {activos.map((activo) => (
                          <label
                            key={activo.id}
                            className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={dest.gruas_asignadas.includes(activo.id)}
                              onChange={() => toggleGruaEmail(dest.id, activo.id)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">{activo.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  {destinatariosEmail.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No hay destinatarios de email configurados. Agrega uno arriba.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {supervisores.map((sup) => (
                  <div key={sup.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900">{sup.nombre_completo}</h3>
                      <p className="text-sm text-gray-600">{sup.rut || 'Sin RUT'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {sup.gruas_asignadas.length === 0 ? (
                          <span className="text-blue-600 font-medium">Recibe de TODAS las grúas</span>
                        ) : (
                          `${sup.gruas_asignadas.length} grúa(s) asignada(s)`
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {activos.map((activo) => (
                        <label
                          key={activo.id}
                          className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={sup.gruas_asignadas.includes(activo.id)}
                            onChange={() => toggleGruaSupervisor(sup.id, activo.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">{activo.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {supervisores.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No hay supervisores registrados en el sistema.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
