// Ponto de entrada lazy dos ambientes de clínica e Super Admin (carregado só quando a rota é acessada).
import { MasterLayout } from './layouts'
import { ModulesReady } from '@/modules/ready'
export { StaffGate, ClinicGate, PortalGate } from './gates'

export function MasterShell() {
  return <ModulesReady><MasterLayout /></ModulesReady>
}
