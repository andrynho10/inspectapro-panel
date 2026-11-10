'use client'

import { useState, useEffect } from 'react'
import { loginSupervisor } from '@/lib/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('/dashboard')

  // Lee el parámetro ?redirect= para redirigir al recurso original tras un login exitoso
  useEffect(() => {
    // Obtener parámetro redirect de la URL
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect')
    if (redirect) {
      setRedirectUrl(redirect)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Iniciando login...')
    setError('')
    setLoading(true)

    try {
      console.log('Email:', email)
      const result = await loginSupervisor(email, password)
      console.log('Resultado login:', result)

      if (result.success) {
        console.log('Login exitoso, redirigiendo a:', redirectUrl)
        // window.location en lugar de router.push para forzar recarga completa y que el middleware SSR vea la cookie
        window.location.href = redirectUrl
      } else {
        console.error('Error de login:', result.error)
        setError(result.error || 'Error al iniciar sesión')
      }
    } catch (err) {
      console.error('Error inesperado:', err)
      setError('Error inesperado al iniciar sesión')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.svg"
              alt="Logo InspectaPro"
              width={88}
              height={88}
              priority
              unoptimized
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">InspectaPro</h1>
          <h2 className="text-lg font-medium text-gray-600">Panel de Supervisor</h2>
          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <div className="mt-4 text-left bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Versión demo · datos ficticios</p>
              <p className="mt-1">Usuario: <code>supervisor.demo@example.com</code></p>
              <p>Contraseña: <code>Demo1234!</code></p>
              <button
                type="button"
                onClick={() => { setEmail('supervisor.demo@example.com'); setPassword('Demo1234!') }}
                className="mt-2 text-amber-800 underline font-medium"
              >
                Completar automáticamente
              </button>
            </div>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="supervisor.demo@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="********"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
