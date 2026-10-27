// Seeds do módulo clínico: modelos de formulário (com versões), respostas (pendente + versão antiga), anamneses.
import { registerSeed } from '@/data/store'
import type { FormField, FormResponse, FormTemplate } from '@/domain/modules'
import { demoBaseDate } from '@/lib/dates'
import type { Anamnesis } from './types'
import './types'

const at = (daysAgo: number) => new Date(demoBaseDate().getTime() - daysAgo * 86400000).toISOString()
const f = (id: string, type: FormField['type'], label: string, extra: Partial<FormField> = {}): FormField => ({ id, type, label, ...extra })

const ANAMNESE_V1: FormField[] = [
  f('sec1', 'section', 'Saúde geral'),
  f('queixa', 'textarea', 'Qual o motivo da consulta?', { required: true, max: 1000 }),
  f('alergia', 'boolean', 'Possui alguma alergia?', { required: true }),
  f('alergia_qual', 'text', 'Quais alergias?', { required: true, showIf: { fieldId: 'alergia', equals: 'sim' } }),
  f('medicamentos', 'textarea', 'Usa medicamentos contínuos? Quais?'),
]
const ANAMNESE_V2: FormField[] = [
  ...ANAMNESE_V1,
  f('sec2', 'section', 'Hábitos'),
  f('fuma', 'single', 'Tabagismo', { options: ['Nunca fumou', 'Ex-fumante', 'Fumante'], required: true }),
  f('cigarros', 'number', 'Cigarros por dia', { min: 1, max: 80, showIf: { fieldId: 'fuma', equals: 'Fumante' } }),
  f('atividade', 'multi', 'Atividades físicas', { options: ['Caminhada', 'Musculação', 'Corrida', 'Natação', 'Nenhuma'] }),
]
const ODONTO: FormField[] = [
  f('ultima', 'date', 'Data aproximada da última consulta odontológica'),
  f('sangramento', 'boolean', 'Sua gengiva sangra ao escovar?', { required: true }),
  f('sensibilidade', 'single', 'Sente sensibilidade?', { options: ['Não', 'Ao frio', 'Ao quente', 'Ao doce'], required: true }),
  f('anestesia', 'boolean', 'Já teve reação à anestesia?', { required: true }),
  f('anestesia_desc', 'textarea', 'Descreva a reação', { showIf: { fieldId: 'anestesia', equals: 'sim' }, required: true }),
]
const VET: FormField[] = [
  f('sec', 'section', 'Sobre o animal'),
  f('apetite', 'single', 'Como está o apetite?', { options: ['Normal', 'Aumentado', 'Diminuído', 'Sem comer'], required: true }),
  f('vomito', 'boolean', 'Apresentou vômito ou diarreia nos últimos dias?', { required: true }),
  f('vomito_dias', 'number', 'Há quantos dias?', { min: 0, max: 60, showIf: { fieldId: 'vomito', equals: 'sim' }, required: true }),
  f('vacinas', 'boolean', 'Vacinas em dia (segundo a carteira)?'),
  f('obs', 'textarea', 'Observações do tutor'),
]
const ALIMENTAR: FormField[] = [
  f('refeicoes', 'number', 'Quantas refeições por dia?', { min: 1, max: 10, required: true }),
  f('agua', 'single', 'Consumo de água', { options: ['Menos de 1 L', '1 a 2 L', 'Mais de 2 L'], required: true }),
  f('restricao', 'multi', 'Restrições alimentares', { options: ['Lactose', 'Glúten', 'Vegetariano', 'Vegano', 'Nenhuma'] }),
  f('objetivo', 'textarea', 'O que espera do acompanhamento?', { min: 5, max: 600 }),
]

registerSeed('formTemplates', ({ tenantId }) => {
  const mk = (id: string, name: string, specialty: string, versions: FormField[][], audience: FormTemplate['audience'] = 'paciente'): FormTemplate => ({
    id: `${tenantId}_${id}`, tenantId, createdAt: at(120), name, specialty, audience, active: true, currentVersion: versions.length,
    versions: versions.map((fields, i) => ({ version: i + 1, publishedAt: at(120 - i * 60), fields })),
  })
  return [
    mk('ft_anamnese', 'Anamnese geral', 'geral', [ANAMNESE_V1, ANAMNESE_V2]),
    mk('ft_odonto', 'Anamnese odontológica', 'odontologia', [ODONTO]),
    mk('ft_vet', 'Triagem veterinária', 'veterinaria', [VET]),
    mk('ft_alimentar', 'Anamnese alimentar', 'nutricao', [ALIMENTAR]),
  ]
})

registerSeed('formResponses', ({ tenantId, get }) => {
  const patients = get('patients')
  const p1 = patients[0]
  const p2 = patients[1] ?? p1
  if (!p1) return []
  const out: FormResponse[] = [
    { id: `${tenantId}_fr1`, tenantId, createdAt: at(1), templateId: `${tenantId}_ft_anamnese`, templateVersion: 2, patientId: p1.id, answers: {}, submittedBy: p1.kind === 'animal' ? 'responsavel' : 'paciente', status: 'pendente' },
    { id: `${tenantId}_fr2`, tenantId, createdAt: at(80), templateId: `${tenantId}_ft_anamnese`, templateVersion: 1, patientId: p2.id, submittedAt: at(79), submittedBy: 'paciente', status: 'enviado', answers: { queixa: 'Revisão de rotina (fictício).', alergia: true, alergia_qual: 'Penicilina (fictício)', medicamentos: 'Nenhum' } },
  ]
  if (p1.kind === 'animal') out.push({ id: `${tenantId}_fr3`, tenantId, createdAt: at(2), templateId: `${tenantId}_ft_vet`, templateVersion: 1, patientId: p1.id, answers: {}, submittedBy: 'responsavel', status: 'pendente' })
  return out
})

registerSeed('anamneses', ({ tenantId, get }) => get('patients').slice(0, 6).map((p, i): Anamnesis => ({
  id: `${tenantId}_an${i + 1}`, tenantId, createdAt: at(60), patientId: p.id,
  problems: i % 2 === 0 ? [{ id: `${tenantId}_an${i + 1}_p1`, description: p.kind === 'animal' ? 'Dermatite recorrente (fictício)' : 'Enxaqueca episódica (fictício)', status: 'ativo', since: at(400).slice(0, 10) }] : [],
  medications: i % 3 === 0 ? [p.kind === 'animal' ? 'Antiparasitário mensal (fictício)' : 'Uso contínuo informado pelo paciente (fictício)'] : [],
  history: 'Antecedentes registrados pelo profissional (fictício).', habits: p.kind === 'animal' ? 'Passeios diários (fictício).' : 'Atividade física 2x/semana (fictício).',
})))
registerSeed('dictations', () => [])
registerSeed('recordSignatures', () => [])
registerSeed('patientMerges', () => [])
