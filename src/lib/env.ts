/** Sessão atual é do ambiente conectado (Supabase)? Lido do armazenamento para não acoplar lib/ui → app. Node/testes: false. */
export function isConnectedEnv(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    const v = sessionStorage.getItem('qlinic.session') ?? localStorage.getItem('qlinic.session')
    return !!v && (JSON.parse(v) as { remote?: boolean }).remote === true
  } catch { return false }
}
