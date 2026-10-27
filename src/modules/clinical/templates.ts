// Templates de registro clínico (schema VERSIONADO por especialidade) e de documentos. Puro (sem React/store).
import type { DocumentKind, Segment } from '@/domain/types'

export type RecordFieldKind = 'text' | 'textarea' | 'number' | 'select'
export interface RecordField { id: string; label: string; kind: RecordFieldKind; required?: boolean; options?: string[]; unit?: string; min?: number; max?: number; hint?: string }
export interface RecordTemplate { id: string; version: number; segment: Segment; title: string; restricted?: boolean; fields: RecordField[]; note?: string }

const ta = (id: string, label: string, required = false, hint?: string): RecordField => ({ id, label, kind: 'textarea', required, hint })
const tx = (id: string, label: string, required = false, hint?: string): RecordField => ({ id, label, kind: 'text', required, hint })
const nu = (id: string, label: string, unit: string, min: number, max: number, required = false): RecordField => ({ id, label, kind: 'number', unit, min, max, required })

// IDs de campos compatíveis com os registros de seed (versão 1).
export const RECORD_TEMPLATES: RecordTemplate[] = [
  { id: 'soap', version: 1, segment: 'medicina', title: 'Evolução SOAP', fields: [ta('s', 'S — Subjetivo (relato)', true), ta('o', 'O — Objetivo (exame físico)', true), ta('a', 'A — Avaliação', true, 'Hipóteses do médico. Não registre código/diagnóstico sugerido sem revisão.'), ta('p', 'P — Plano', true)] },
  {
    id: 'soap', version: 2, segment: 'medicina', title: 'Evolução SOAP', note: 'Versão 2: sinais vitais estruturados.',
    fields: [ta('s', 'S — Subjetivo (relato)', true), nu('pas', 'PA sistólica', 'mmHg', 50, 260), nu('pad', 'PA diastólica', 'mmHg', 30, 160), nu('fc', 'Frequência cardíaca', 'bpm', 20, 250), ta('o', 'O — Objetivo (exame físico)', true), ta('a', 'A — Avaliação', true, 'Hipóteses do médico. Não registre código/diagnóstico sugerido sem revisão.'), ta('p', 'P — Plano', true)],
  },
  { id: 'odonto_evolucao', version: 1, segment: 'odontologia', title: 'Evolução odontológica', fields: [tx('queixa', 'Queixa principal', true), ta('procedimento', 'Procedimento realizado', true), tx('dentes', 'Dentes/regiões', false, 'Ex.: 16, 26. Detalhamento por face fica no odontograma.'), ta('observacoes', 'Observações')] },
  { id: 'vet_consulta', version: 1, segment: 'veterinaria', title: 'Consulta veterinária', fields: [ta('anamnese', 'Anamnese (relato do tutor)', true), ta('exame', 'Exame físico', true), nu('peso', 'Peso', 'kg', 0.05, 150), nu('temperatura', 'Temperatura', '°C', 30, 45), ta('conduta', 'Conduta', true)] },
  { id: 'estetica_sessao', version: 1, segment: 'estetica', title: 'Registro de sessão estética', fields: [tx('regiao', 'Região tratada', true), tx('produto', 'Produto/técnica', true), tx('lote', 'Lote do produto'), ta('observacoes', 'Observações e intercorrências')] },
  { id: 'psico_sessao', version: 1, segment: 'psicologia', title: 'Registro de sessão', restricted: true, fields: [ta('tema', 'Temas trabalhados', true), ta('evolucao', 'Evolução', true), ta('plano', 'Planejamento para próximas sessões')] },
  { id: 'fisio_evolucao', version: 1, segment: 'fisioterapia', title: 'Evolução fisioterapêutica', fields: [nu('dor', 'Dor (escala 0–10)', 'pontos', 0, 10, true), ta('conduta', 'Conduta', true), ta('resposta', 'Resposta ao tratamento')] },
  { id: 'nutri_consulta', version: 1, segment: 'nutricao', title: 'Consulta nutricional', fields: [nu('peso', 'Peso', 'kg', 2, 400), ta('objetivo', 'Objetivo combinado', true), ta('orientacoes', 'Orientações', true)] },
]

export function currentTemplate(seg: Segment): RecordTemplate {
  const list = RECORD_TEMPLATES.filter((t) => t.segment === seg)
  return list.reduce((a, b) => (b.version > a.version ? b : a))
}
export function findTemplate(id: string, version: number): RecordTemplate | undefined {
  return RECORD_TEMPLATES.find((t) => t.id === id && t.version === version)
}
export function templateVersions(id: string): number[] {
  return RECORD_TEMPLATES.filter((t) => t.id === id).map((t) => t.version)
}

const empty = (v: unknown) => v === undefined || v === null || String(v).trim() === ''
/** Valida conteúdo estruturado conforme o schema da versão do template. */
export function validateRecordContent(tpl: RecordTemplate, content: Record<string, unknown>): Record<string, string> {
  const e: Record<string, string> = {}
  for (const f of tpl.fields) {
    const v = content[f.id]
    if (empty(v)) { if (f.required) e[f.id] = 'Campo obrigatório para revisar/finalizar.'; continue }
    if (f.kind === 'number') {
      const n = Number(String(v).replace(',', '.'))
      if (!Number.isFinite(n)) e[f.id] = 'Informe um número.'
      else if (f.min != null && n < f.min) e[f.id] = `Valor mínimo: ${f.min}.`
      else if (f.max != null && n > f.max) e[f.id] = `Valor máximo: ${f.max}.`
    }
    if (f.kind === 'select' && f.options && !f.options.includes(String(v))) e[f.id] = 'Opção inválida.'
  }
  return e
}

/** Fixtures DETERMINÍSTICAS de transcrição simulada (nenhum modelo conectado). Cada trecho aponta o campo sugerido. */
export const TRANSCRIPT_FIXTURES: Record<Segment, { field: string; text: string }[]> = {
  medicina: [
    { field: 's', text: 'Paciente relata dor de cabeça leve há cerca de duas semanas, sem febre.' },
    { field: 'o', text: 'Pressão aferida em doze por oito, ausculta sem alterações.' },
    { field: 'p', text: 'Orientado a retornar se houver piora; reavaliar em trinta dias.' },
  ],
  odontologia: [
    { field: 'queixa', text: 'Sensibilidade ao frio no lado direito superior.' },
    { field: 'procedimento', text: 'Realizada profilaxia e aplicação de flúor.' },
    { field: 'observacoes', text: 'Reforçada orientação de uso de fio dental.' },
  ],
  veterinaria: [
    { field: 'anamnese', text: 'Tutor relata apetite normal e fezes firmes.' },
    { field: 'exame', text: 'Mucosas normocoradas, hidratação adequada.' },
    { field: 'conduta', text: 'Manter alimentação atual e retornar para reforço vacinal conforme definido.' },
  ],
  estetica: [
    { field: 'regiao', text: 'Região frontal e glabela.' },
    { field: 'observacoes', text: 'Sem intercorrências durante o procedimento.' },
  ],
  psicologia: [
    { field: 'tema', text: 'Conversamos sobre rotina de trabalho e sono.' },
    { field: 'plano', text: 'Retomar o tema na próxima sessão.' },
  ],
  fisioterapia: [
    { field: 'conduta', text: 'Mobilização articular e exercícios de fortalecimento.' },
    { field: 'resposta', text: 'Boa tolerância, relata alívio ao final.' },
  ],
  nutricao: [
    { field: 'objetivo', text: 'Organizar horários das refeições ao longo do dia.' },
    { field: 'orientacoes', text: 'Aumentar ingestão de água e incluir vegetais no almoço.' },
  ],
}

// ---------- Documentos ----------
export const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  receita: 'Receita', atestado: 'Atestado', orientacao: 'Orientação', recibo: 'Recibo', termo: 'Termo', laudo: 'Laudo', pedido_exame: 'Pedido de exame',
  encaminhamento: 'Encaminhamento', declaracao: 'Declaração', contrato: 'Contrato', relatorio: 'Relatório',
}
/** Tipos que permanecem RASCUNHO demonstrativo (emissão real = integração futura). */
export const DEMO_ONLY_KINDS: DocumentKind[] = ['receita', 'atestado']

export interface DocTemplate { id: string; kind: DocumentKind; version: number; title: string; body: string }
export const DOC_VARIABLES: { key: string; label: string }[] = [
  { key: 'paciente_nome', label: 'Paciente' }, { key: 'paciente_cpf', label: 'CPF' }, { key: 'paciente_nascimento', label: 'Nascimento' },
  { key: 'responsavel_nome', label: 'Responsável/tutor' }, { key: 'profissional_nome', label: 'Profissional' }, { key: 'profissional_registro', label: 'Registro' },
  { key: 'clinica_nome', label: 'Clínica' }, { key: 'clinica_cnpj', label: 'CNPJ' }, { key: 'clinica_cidade', label: 'Cidade' },
  { key: 'unidade_endereco', label: 'Endereço' }, { key: 'data_hoje', label: 'Data' },
]

const SIGN = '\n\n________________________________\n{{profissional_nome}} — {{profissional_registro}}'
export const DOC_TEMPLATES: DocTemplate[] = [
  { id: 'receita_simples', kind: 'receita', version: 1, title: 'Receita (modelo demonstrativo)', body: 'Paciente: {{paciente_nome}}\nData: {{data_hoje}}\n\nUso: ______\n1. [medicamento] — [posologia definida pelo profissional]\n2. ______\n\nPrescrição real depende de integração com serviço de prescrição eletrônica (futuro).' + SIGN },
  { id: 'atestado_comparecimento', kind: 'atestado', version: 1, title: 'Atestado (modelo demonstrativo)', body: 'Atesto, para os devidos fins, que {{paciente_nome}} esteve em atendimento nesta clínica em {{data_hoje}}, necessitando de afastamento por ___ dia(s).' + SIGN },
  { id: 'atestado_comparecimento', kind: 'atestado', version: 2, title: 'Atestado (modelo demonstrativo)', body: 'Atesto, para os devidos fins, que {{paciente_nome}} esteve em atendimento nesta clínica em {{data_hoje}}, necessitando de afastamento por ___ dia(s).\n\nCódigo da condição: incluir somente com autorização expressa do paciente.' + SIGN },
  { id: 'orientacao_geral', kind: 'orientacao', version: 1, title: 'Orientações ao paciente', body: 'Orientações para {{paciente_nome}} ({{data_hoje}}):\n\n• ______\n• ______\n\nEm caso de dúvida, entre em contato com {{clinica_nome}}.' + SIGN },
  { id: 'termo_consentimento', kind: 'termo', version: 1, title: 'Termo de consentimento', body: 'Eu, {{responsavel_nome}}, declaro ter recebido explicações sobre o procedimento proposto para {{paciente_nome}}, seus benefícios, riscos e alternativas, e autorizo sua realização.\n\n{{clinica_cidade}}, {{data_hoje}}.\n\n________________________________\nAssinatura do paciente/responsável' },
  { id: 'declaracao_comparecimento', kind: 'declaracao', version: 1, title: 'Declaração de comparecimento', body: 'Declaramos que {{paciente_nome}} compareceu a atendimento em {{clinica_nome}} ({{unidade_endereco}}) em {{data_hoje}}.\n\nDocumento sem informações clínicas.' + SIGN },
  { id: 'encaminhamento', kind: 'encaminhamento', version: 1, title: 'Encaminhamento', body: 'Encaminho {{paciente_nome}} (nasc. {{paciente_nascimento}}) para avaliação com: ______\n\nMotivo: ______' + SIGN },
  { id: 'pedido_exame', kind: 'pedido_exame', version: 1, title: 'Pedido de exame', body: 'Paciente: {{paciente_nome}}\nSolicito: ______\n\nIndicação: ______\nData: {{data_hoje}}' + SIGN },
]
export function docTemplatesFor(kind: DocumentKind): DocTemplate[] {
  return DOC_TEMPLATES.filter((d) => d.kind === kind)
}
export function latestDocTemplate(id: string): DocTemplate | undefined {
  return DOC_TEMPLATES.filter((d) => d.id === id).sort((a, b) => b.version - a.version)[0]
}
