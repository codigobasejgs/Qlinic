import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './styles/app.css'
import { migrateIfNeeded } from '@/data/store'
// Seeds da plataforma + núcleo por tenant (leve). Seeds/efeitos dos módulos: sob demanda (modules/ready.tsx).
import '@/data/platformSeed'
import { router } from '@/app/routes'
import { OverlayProvider } from '@/ui/overlay'
import { registerServiceWorker } from '@/pwa/client'

migrateIfNeeded()
registerServiceWorker()

// Error reporting futuro: sanitizar (sem conteúdo clínico, sem PII). Aqui apenas log local.
window.addEventListener('unhandledrejection', (e) => console.error('[qlinic] rejeição não tratada', e.reason instanceof Error ? e.reason.message : 'erro'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayProvider>
      <RouterProvider router={router} />
    </OverlayProvider>
  </StrictMode>,
)
