// Conteúdo comercial. Regra: só afirmar o que a demonstração mostra. Sem depoimentos, números de clientes,
// certificações, economia garantida, superioridade sobre concorrentes ou "100% LGPD".
import type { Segment } from '@/domain/types'

export interface SegmentInfo {
  key: Segment
  label: string
  /** Slug da clínica fictícia correspondente. */
  demoSlug: string
  demoName: string
  pitch: string
  modules: { title: string; body: string; route: string }[]
  flows: string[]
  notes: string[]
}

export const SEGMENTS: SegmentInfo[] = [
  {
    key: 'odontologia', label: 'Odontologia', demoSlug: 'sorriso-pleno', demoName: 'Sorriso Pleno Odontologia',
    pitch: 'Odontograma, plano de tratamento e orçamento ligados ao mesmo paciente, com rede de duas unidades na demonstração.',
    modules: [
      { title: 'Odontograma 2D', body: 'Dentição permanente e decídua, seleção de dente e face, condição e procedimento.', route: 'odontologia' },
      { title: 'Orçamentos com versões', body: 'Itens, opções, desconto permitido, parcelamento e aceite parcial.', route: 'orcamentos' },
      { title: 'Agenda por cadeira', body: 'Profissional, cadeira e procedimento com verificação de conflito.', route: 'agenda' },
      { title: 'Estoque e esterilização', body: 'Lotes, validade e consumo por procedimento concluído.', route: 'estoque' },
    ],
    flows: ['Odontograma → plano de tratamento → orçamento → aceite pelo link → cobrança', 'Laboratório de prótese: solicitado, enviado, recebido, ajuste, entregue', 'Gestão de rede com seletor de unidade e permissões por unidade'],
    notes: ['Marcação no odontograma é registro do profissional, não diagnóstico automático.'],
  },
  {
    key: 'medicina', label: 'Medicina ambulatorial', demoSlug: 'clinica-vitta', demoName: 'Clínica Vitta',
    pitch: 'Evolução SOAP, sinais vitais, exames, receitas e atestados em rascunho, além de convênios com guias e glosas demonstrativas.',
    modules: [
      { title: 'Prontuário SOAP', body: 'Templates por especialidade, finalização e adendo com autor e motivo.', route: 'medicina' },
      { title: 'Convênios', body: 'Carteirinha, elegibilidade simulada, guias, lotes, glosa e recurso.', route: 'convenios' },
      { title: 'Documentos', body: 'Receitas, atestados e encaminhamentos com marca d’água de demonstração.', route: 'documentos' },
      { title: 'Agenda e recepção', body: 'Check-in por QR de curta duração e painel de chamada com nome abreviado.', route: 'recepcao' },
    ],
    flows: ['Agendamento → check-in → consulta → finalização → retorno', 'Guia de convênio → lote → glosa → recurso (artefato demonstrativo, sem XML homologado)'],
    notes: ['TISS/TUSS é integração versionada futura. Curvas pediátricas reais dependem de referência validada.'],
  },
  {
    key: 'veterinaria', label: 'Veterinária', demoSlug: 'vet-amigo', demoName: 'Vet Amigo',
    pitch: 'Tutor com vários animais, carteira de vacinação por animal com lote e retorno definido pelo veterinário, e internação com tarefas por horário.',
    modules: [
      { title: 'Ficha do animal', body: 'Espécie, raça, peso com histórico, pelagem e microchip.', route: 'veterinaria' },
      { title: 'Vacinas e vermifugação', body: 'Produto, lote, profissional e data de retorno informada pelo veterinário.', route: 'veterinaria' },
      { title: 'Internação', body: 'Mapa de boxes, prescrição, tarefas por horário e registro de administração.', route: 'veterinaria' },
      { title: 'Estoque', body: 'Lotes e validade de medicamentos e insumos.', route: 'estoque' },
    ],
    flows: ['Tutor escolhe o animal no portal e acompanha vacinas', 'Internação: admissão → evolução → administração registrada → alta'],
    notes: ['Calculadora de conversão usa apenas a dose prescrita pelo profissional; não sugere medicamento nem dose.'],
  },
  {
    key: 'estetica', label: 'Estética', demoSlug: 'lumiere-estetica', demoName: 'Lumière Estética',
    pitch: 'Mapa facial e corporal, pacotes de sessões com consumo e validade, e comparador antes/depois com consentimento por finalidade.',
    modules: [
      { title: 'Mapa facial/corporal', body: 'Pontos, regiões, produto, volume, lote e profissional.', route: 'estetica' },
      { title: 'Pacotes e sessões', body: 'Sessões previstas e realizadas, validade contratual.', route: 'estetica' },
      { title: 'CRM', body: 'Funil de contatos, propostas e motivo de perda.', route: 'crm' },
      { title: 'Comissões', body: 'Regra por profissional e procedimento com memória de cálculo.', route: 'comissoes' },
    ],
    flows: ['Avaliação → pacote → sessões → comparação antes/depois', 'Lead no CRM → proposta → aceite'],
    notes: ['Simulação estética nunca é apresentada como resultado garantido. Uso clínico e publicitário de imagens têm consentimentos separados.'],
  },
  {
    key: 'psicologia', label: 'Psicologia', demoSlug: 'espaco-escuta', demoName: 'Espaço Escuta',
    pitch: 'Agenda recorrente, registros de sessão com acesso restrito ao profissional e atendimento de menores sem presumir compartilhamento com responsáveis.',
    modules: [
      { title: 'Registros com sigilo', body: 'Somente o profissional responsável lê o conteúdo; recepção vê só a agenda.', route: 'psicologia' },
      { title: 'Agenda recorrente', body: 'Séries semanais com tratamento de conflito ao editar.', route: 'agenda' },
      { title: 'Portal', body: 'Mostra apenas documentos explicitamente liberados.', route: 'documentos' },
      { title: 'Financeiro', body: 'Pacotes de sessões, recebimentos parciais e recibos.', route: 'financeiro' },
    ],
    flows: ['Sessão recorrente → registro restrito → documento liberado ao portal', 'Responsável de menor com permissões financeiras separadas das clínicas'],
    notes: ['Na demonstração, o sigilo é regra de interface. Em produção depende de autorização no servidor.'],
  },
  {
    key: 'fisioterapia', label: 'Fisioterapia', demoSlug: 'movimento-fisio', demoName: 'Movimento Fisioterapia',
    pitch: 'Avaliação funcional, metas, plano de sessões, prescrição de exercícios e adesão declarada pelo paciente no portal.',
    modules: [
      { title: 'Avaliação e metas', body: 'Avaliação funcional estruturada e evolução por sessão.', route: 'fisioterapia' },
      { title: 'Exercícios', body: 'Prescrição pelo profissional, com mídia demonstrativa.', route: 'fisioterapia' },
      { title: 'Plano de cuidado', body: 'Encaminhamentos internos e tarefas multidisciplinares.', route: 'multidisciplinar' },
      { title: 'Convênios', body: 'Guias e autorizações demonstrativas.', route: 'convenios' },
    ],
    flows: ['Avaliação → plano de sessões → exercícios no portal → adesão declarada', 'Plano multidisciplinar com liberação por profissional'],
    notes: ['A clínica fictícia está em período de teste, para mostrar o estado de trial.'],
  },
  {
    key: 'nutricao', label: 'Nutrição', demoSlug: 'nutri-equilibrio', demoName: 'Nutri Equilíbrio',
    pitch: 'Anamnese alimentar, medidas e comparação de avaliações, com plano estruturado editado pelo profissional e liberado no portal.',
    modules: [
      { title: 'Avaliações', body: 'Medidas, evolução e comparação entre avaliações.', route: 'nutricao' },
      { title: 'Plano alimentar', body: 'Estruturado e editado pelo profissional; nada gerado automaticamente.', route: 'nutricao' },
      { title: 'Automações', body: 'Lembrete de retorno definido pelo profissional.', route: 'automacoes' },
      { title: 'CRM', body: 'Contatos, propostas e acompanhamento.', route: 'crm' },
    ],
    flows: ['Anamnese → medidas → plano → liberação no portal', 'Retorno definido → lembrete simulado'],
    notes: ['Não há geração de dieta terapêutica ou metas clínicas automáticas.'],
  },
]
export function segmentByKey(k: string | undefined) { return SEGMENTS.find((s) => s.key === k) }

export type FeatureStatus = 'demonstracao' | 'integracao_futura'
export interface Feature { title: string; body: string; status: FeatureStatus; route?: string }
export const FEATURE_AREAS: { area: string; items: Feature[] }[] = [
  { area: 'Agenda e recepção', items: [
    { title: 'Agenda dia/semana/mês/lista', body: 'Por profissional, sala, cadeira e unidade, com conflitos verificados.', status: 'demonstracao', route: 'agenda' },
    { title: 'Lista de espera', body: 'Oferta de vaga ao cancelar, com expiração simulada.', status: 'demonstracao', route: 'lista-espera' },
    { title: 'Check-in por QR e totem', body: 'Token de curta duração, sem dados clínicos no QR.', status: 'demonstracao', route: '/c/clinica-vitta/totem' },
    { title: 'Painel de chamada', body: 'Nome abreviado ou senha, conforme configuração.', status: 'demonstracao', route: '/c/clinica-vitta/painel' },
  ] },
  { area: 'Clínico', items: [
    { title: 'Prontuário com adendo', body: 'Finalizado não é sobrescrito; correção gera adendo.', status: 'demonstracao', route: 'pacientes' },
    { title: 'Construtor de formulários', body: 'Campos, condições simples e versões.', status: 'demonstracao', route: 'formularios' },
    { title: 'Módulos por especialidade', body: 'Odontologia, medicina, veterinária, estética, psicologia, fisioterapia e nutrição.', status: 'demonstracao', route: 'odontologia' },
    { title: 'Assinatura eletrônica qualificada', body: 'Fluxo visual pronto; validade jurídica depende de provedor integrado.', status: 'integracao_futura' },
    { title: 'Visualizador DICOM diagnóstico', body: 'Integração específica futura.', status: 'integracao_futura' },
  ] },
  { area: 'Comercial e financeiro', items: [
    { title: 'CRM e orçamentos', body: 'Kanban, propostas com versões e link de aceite.', status: 'demonstracao', route: 'crm' },
    { title: 'Financeiro e caixa', body: 'Parcial, estorno vinculado, abertura e fechamento de caixa.', status: 'demonstracao', route: 'financeiro' },
    { title: 'Comissões e repasses', body: 'Regras versionadas e memória de cálculo (gerencial, não split bancário).', status: 'demonstracao', route: 'comissoes' },
    { title: 'Estoque e compras', body: 'Lote, validade, consumo por ficha técnica, pedido e recebimento.', status: 'demonstracao', route: 'estoque' },
    { title: 'Gateways (InfinitePay, Asaas, Mercado Pago)', body: 'Telas e contratos prontos; cobrança real só após homologação.', status: 'integracao_futura' },
    { title: 'NFS-e', body: 'Emissão demonstrativa sem validade fiscal; provedor real futuro.', status: 'integracao_futura' },
  ] },
  { area: 'Relacionamento', items: [
    { title: 'Portal do paciente e tutor', body: 'Consultas, documentos liberados, pagamentos simulados e preferências.', status: 'demonstracao', route: '/c/vet-amigo/portal' },
    { title: 'Fila de comunicação', body: 'WhatsApp, e-mail e push com deduplicação e preferências (envio simulado).', status: 'demonstracao', route: 'comunicacao' },
    { title: 'Envio por Resend e Evolution API', body: 'Adapters preparados; credenciais apenas no servidor futuro.', status: 'integracao_futura' },
    { title: 'Assistente e automações', body: 'Respostas determinísticas com selo de simulação.', status: 'demonstracao', route: 'automacoes' },
    { title: 'Modelo de IA conectado', body: 'Provedor substituível; sem modelo real nesta fase.', status: 'integracao_futura' },
  ] },
  { area: 'Gestão e plataforma', items: [
    { title: 'Marca e app (PWA) por clínica', body: 'Manifesto e ícones por clínica de demonstração.', status: 'demonstracao', route: 'marca' },
    { title: 'Permissões e “visualizar como”', body: 'Matriz por recurso, ação e unidade.', status: 'demonstracao', route: 'permissoes' },
    { title: 'Importação CSV', body: 'Mapeamento, prévia, erros por linha e desfazer lote fictício.', status: 'demonstracao', route: 'importacao' },
    { title: 'Super Admin', body: 'Planos, testes, assinaturas, integrações, domínios e custos.', status: 'demonstracao', route: '/master' },
    { title: 'Autenticação e isolamento no servidor', body: 'Supabase Auth, Postgres com RLS e storage privado.', status: 'integracao_futura' },
    { title: 'Domínio próprio por clínica', body: 'Verificação de hostname e certificado.', status: 'integracao_futura' },
  ] },
]

export const FAQ: { q: string; a: string }[] = [
  { q: 'Isto é um sistema em produção?', a: 'Não. É uma demonstração navegável do frontend, com dados fictícios guardados apenas neste navegador. Não há envio, cobrança nem autenticação reais.' },
  { q: 'Os preços são definitivos?', a: 'Não. São valores de demonstração editáveis no Super Admin e não representam decisão comercial.' },
  { q: 'WhatsApp, armazenamento e IA são ilimitados?', a: 'Não. Cada plano tem uma franquia mensal e o excedente é cobrado por unidade, conforme a tabela de planos. Custos de provedores externos existem e são repassados de forma transparente.' },
  { q: 'O app da clínica aparece na loja de aplicativos?', a: 'Não. É um app web instalável (PWA) com a marca da clínica. A instalação depende do navegador; no iPhone é feita pelo Safari em Compartilhar → Adicionar à Tela de Início.' },
  { q: 'Como ficam a privacidade e a LGPD?', a: 'O produto foi desenhado com minimização, permissões por perfil, trilhas de auditoria e separação entre clínicas. Conformidade real depende de backend, contratos, processos e validação jurídica, que são etapas posteriores.' },
  { q: 'Consigo migrar meus dados de outro sistema?', a: 'Há um importador CSV demonstrativo com prévia e erros por linha. Migração real exige amostra autorizada, análise do formato e reconciliação; não prometemos prazo nem compatibilidade sem essa análise.' },
  { q: 'Pacientes entram com CPF e data de nascimento?', a: 'Não. Em produção o acesso usará autenticação própria. CPF ou data de nascimento nunca serão usados isoladamente como forma de login.' },
]

export const BENEFITS: { title: string; body: string; slug: string; route: string; shot: string }[] = [
  { title: 'Agenda sem conflitos', body: 'Profissional, sala e equipamento verificados antes de salvar, com motivo para reagendar e cancelar.', slug: 'sorriso-pleno', route: 'agenda', shot: 'agenda' },
  { title: 'Odontograma ligado ao orçamento', body: 'Marque dente e face, gere o plano e envie o orçamento para aceite.', slug: 'sorriso-pleno', route: 'odontologia', shot: 'odontograma' },
  { title: 'Recepção e chegada', body: 'Fila do dia, check-in por QR de curta duração e painel com nome abreviado.', slug: 'clinica-vitta', route: 'recepcao', shot: 'recepcao' },
  { title: 'Portal do paciente e tutor', body: 'Consultas, documentos liberados, vacinas por animal e pagamentos simulados.', slug: 'vet-amigo', route: '/c/vet-amigo/portal', shot: 'portal-mobile' },
  { title: 'Financeiro honesto', body: 'Recebimento parcial, estorno vinculado e caixa por operador, sem apagar movimentos.', slug: 'sorriso-pleno', route: 'financeiro', shot: 'financeiro' },
  { title: 'Gestão da plataforma', body: 'Planos, testes, assinaturas, integrações e custos por contratante.', slug: '', route: '/master', shot: 'master' },
]
