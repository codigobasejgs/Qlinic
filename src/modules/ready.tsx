// Seeds/efeitos dos módulos só são necessários nos ambientes de clínica (equipe, portal, público da clínica).
// Carregados sob demanda para não pesar no bundle do site comercial e Super Admin.
import { Suspense, use, type ReactNode } from 'react'
import { PageFallback } from '@/app/layouts'

let ready: Promise<unknown> | null = null
export function loadModules() {
  return (ready ??= import('./register'))
}

function Wait({ children }: { children: ReactNode }) {
  use(loadModules())
  return <>{children}</>
}
export function ModulesReady({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}><Wait>{children}</Wait></Suspense>
}
