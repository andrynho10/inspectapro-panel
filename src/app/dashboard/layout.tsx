import AsistenteIA from '@/components/AsistenteIA'

// Layout de todas las páginas del panel: agrega el asistente con IA flotante
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AsistenteIA />
    </>
  )
}
