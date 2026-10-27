// Seeds/efeitos dos módulos só são necessários nos ambientes de clínica (equipe, portal, público da clínica).
// Carregados sob demanda para não pesar no bundle do site comercial e Super Admin.
// Sessão conectada (Supabase): re-hidrata os dados do servidor antes de renderizar o ambiente.
import { Suspense, use, type ReactNode } from 'react'
import { PageFallback } from '@/app/layouts'
import { getSession } from '@/app/session'

let ready: Promise<unknown> | null = null
export function loadModules() {
  return (ready ??= (async () => {
    await import('./register')
    if (getSession()?.remote) {
      const { restoreConnected } = await import('@/data/supabase/connected')
      await restoreConnected().catch((e) => console.warn('[qlinic] falha ao restaurar sessão conectada', e))
    }
  })())
}

function Wait({ children }: { children: ReactNode }) {
  use(loadModules())
  return <>{children}</>
}
export function ModulesReady({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}><Wait>{children}</Wait></Suspense>
}
