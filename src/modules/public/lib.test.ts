import { describe, it, expect } from 'vitest'
import { contrastRows, fromLocalInputValue, isDemoCode, isDemoInviteToken, passwordStrength, safeDestino, toLocalInputValue } from './lib'
import { demoLink } from './links'
describe('Regras públicas', () => {
 it('rejeita redirecionamentos externos e travessia',()=>{for(const v of ['https://evil.test','..','agenda/../financeiro','javascript:alert(1)']) expect(safeDestino(v)).toBeNull();expect(safeDestino('agenda')).toBe('agenda')})
 it('senha e códigos fictícios',()=>{expect(passwordStrength('abc').ok).toBe(false);expect(passwordStrength('Exemplo!987xy').ok).toBe(true);expect(isDemoCode('000000')).toBe(true);expect(isDemoCode('123456')).toBe(false);expect(isDemoInviteToken('inválido')).toBe(false)})
 it('todos os pares semânticos atendem 4,5:1',()=>{for(const m of ['light','dark'] as const)expect(contrastRows(m).every(r=>r.aa)).toBe(true)})
 it('preserva data local válida',()=>{const s='2026-10-27T09:30';expect(toLocalInputValue(fromLocalInputValue(s)!)).toBe(s);expect(fromLocalInputValue('nada')).toBeNull()})
 it('portal exige seletor e resolve clínica',()=>{expect(demoLink('/c/:slug/portal','vet-amigo')).toBe('/demonstracao?clinica=vet-amigo&perfil=portal')})
})
