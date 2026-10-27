// Registro eager de seeds e efeitos (handlers de eventos de domínio) de cada módulo.
// Páginas são lazy (rotas); seeds/efeitos precisam existir antes do primeiro acesso a dados.
import '@/data/platformSeed'
import '@/domain/modules'
import '@/domain/settings'
import './portal/seed'
import './scheduling/effects'
import './clinical/seed'
import './specialties/seed'
import './commercial/seed'
import './commercial/effects'
import './engagement/seed'
import './engagement/effects'
import './settings/seed'
