import { supabase } from './supabase'

/**
 * Autentica con Supabase Auth y luego verifica que el usuario sea SUPERVISOR;
 * si el rol no coincide, cierra la sesión inmediatamente y lanza error.
 */
export async function loginSupervisor(email: string, password: string) {
  try {
    // 1. Autenticar con Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) throw authError

    // 2. Verificar que el usuario es SUPERVISOR
    const { data: usuario, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (userError) throw userError

    if (usuario.rol !== 'SUPERVISOR') {
      await supabase.auth.signOut()
      throw new Error('Acceso denegado. Solo supervisores pueden acceder.')
    }

    return { success: true, usuario }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    return { success: false, error: errorMessage }
  }
}

/** Cierra la sesión de Supabase Auth invalidando la cookie de sesión */
export async function logout() {
  const { error } = await supabase.auth.signOut()
  return { success: !error, error: error?.message }
}

/** Recupera la sesión activa y devuelve el perfil completo de la tabla usuarios; null si no hay sesión */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) return null

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', session.user.id)
    .single()

  return usuario
}