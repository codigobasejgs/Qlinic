// Definição dos tours. `route` é relativa à base do ambiente (/app/:slug ou /c/:slug) ou absoluta (começa com /).
// Alvos: nav-* (menu lateral, só existe ≥ 1024 px), primary-action, page-content, unit-selector (rede multiunidade).
import type { ModuleKey, Segment } from '@/domain/types'
import type { Resource } from '@/domain/permissions'

export interface TourStep {
  title: string
  body: string
  target?: string
  route?: string
  /** Passo omitido abaixo desta largura (ex.: alvo no menu lateral, que no celular vira gaveta). */
  minWidth?: number
}
export interface Tour {
  id: string
  title: string
  description: string
  audience: 'master' | 'equipe' | 'portal'
  /** Permissão necessária (equipe): tour oculto se o perfil não acessa a área. */
  resource?: Resource
  /** Módulo que precisa estar habilitado na clínica. */
  module?: ModuleKey
  steps: TourStep[]
}

const DESKTOP = 1024

const SPECIALTY: { seg: Segment; route: string; title: string; resource: Resource; body: string }[] = [
  { seg: 'odontologia', route: 'odontologia', title: 'Odontologia', resource: 'clinical', body: 'Selecione dente e face no odontograma, registre condição e procedimento e gere o plano de tratamento para o orçamento.' },
  { seg: 'medicina', route: 'medicina', title: 'Medicina', resource: 'clinical', body: 'Registre a evolução SOAP, sinais vitais, exames, receitas e atestados (rascunhos demonstrativos).' },
  { seg: 'veterinaria', route: 'veterinaria', title: 'Veterinária', resource: 'clinical', body: 'Escolha o animal do tutor, registre peso, vacinas com lote e retorno definido por você, e acompanhe a internação.' },
  { seg: 'estetica', route: 'estetica', title: 'Estética', resource: 'clinical', body: 'Marque pontos no mapa facial/corporal com produto, volume e lote; controle sessões do pacote.' },
  { seg: 'psicologia', route: 'psicologia', title: 'Psicologia', resource: 'clinical_restricted', body: 'Registros de sessão são visíveis apenas ao profissional responsável. A recepção vê somente a agenda.' },
  { seg: 'fisioterapia', route: 'fisioterapia', title: 'Fisioterapia', resource: 'clinical', body: 'Registre avaliação funcional, metas, evolução e prescreva exercícios que o paciente vê no portal.' },
  { seg: 'nutricao', route: 'nutricao', title: 'Nutrição', resource: 'clinical', body: 'Registre anamnese alimentar e medidas, compare avaliações e edite o plano antes de liberar no portal.' },
]

export const TOURS: Tour[] = [
  {
    id: 'agenda', title: 'Agenda', audience: 'equipe', resource: 'agenda', module: 'agenda',
    description: 'Visualizações, novo agendamento, conflitos e lista de espera.',
    steps: [
      { title: 'Abra a agenda', body: 'A agenda fica no menu Operação. No celular, use o atalho “Agenda” na barra inferior.', target: 'nav-agenda', route: 'agenda', minWidth: DESKTOP },
      { title: 'Unidade', body: 'Em redes com várias unidades, escolha qual unidade visualizar. Você só vê as unidades permitidas ao seu perfil.', target: 'unit-selector', route: 'agenda' },
      { title: 'Novo agendamento', body: 'Escolha paciente, serviço, profissional e recurso. Conflitos de profissional, sala ou equipamento são verificados antes de salvar.', target: 'primary-action', route: 'agenda' },
      { title: 'Grade de horários', body: 'Alterne entre dia, semana, mês e lista. Clique em um horário livre para agendar ou em um atendimento para mudar status ou reagendar com motivo.', target: 'page-content', route: 'agenda' },
      { title: 'Lista de espera', body: 'Quando um horário é cancelado, a vaga pode ser oferecida a quem está na lista, com prazo para aceitar.', target: 'page-content', route: 'lista-espera' },
    ],
  },
  {
    id: 'onboarding', title: 'Configuração inicial da clínica', audience: 'equipe', resource: 'configuracoes',
    description: 'Assistente de configuração, marca, unidades, equipe e checklist.',
    steps: [
      { title: 'Assistente de configuração', body: 'Siga as etapas: organização, segmento, unidades, marca, equipe, políticas, página pública, comunicação e pagamentos. O progresso é salvo e pode ser retomado.', target: 'page-content', route: 'onboarding' },
      { title: 'Avance etapa por etapa', body: 'Cada etapa valida os campos obrigatórios antes de continuar.', target: 'primary-action', route: 'onboarding' },
      { title: 'Marca e app', body: 'Envie logo e símbolo, escolha a cor e confira a prévia clara e escura. O contraste é ajustado automaticamente.', target: 'page-content', route: 'marca' },
      { title: 'Configurações gerais', body: 'Horários, feriados, políticas de agendamento e cancelamento, com regras da rede e exceções por unidade.', target: 'page-content', route: 'configuracoes' },
      { title: 'Checklist inicial', body: 'Na Central de ajuda, marque o que já foi feito. O checklist fica salvo para você nesta clínica.', target: 'page-content', route: 'ajuda' },
    ],
  },
  {
    id: 'recepcao', title: 'Recepção e chegada', audience: 'equipe', resource: 'recepcao', module: 'recepcao',
    description: 'Fila do dia, check-in, chamada e recebimentos.',
    steps: [
      { title: 'Abra a recepção', body: 'A recepção concentra a fila do dia por status: aguardando, chegou, em atendimento e concluído.', target: 'nav-recepcao', route: 'recepcao', minWidth: DESKTOP },
      { title: 'Fila do dia', body: 'Veja documentos pendentes, tempo de espera e o profissional responsável. Alertas clínicos só aparecem para quem tem permissão.', target: 'page-content', route: 'recepcao' },
      { title: 'Registrar chegada', body: 'Faça o check-in pelo balcão ou peça ao paciente para usar o totem com o QR de curta duração. Depois, chame no painel da sala de espera.', target: 'primary-action', route: 'recepcao' },
      { title: 'Agenda do dia', body: 'Para encaixes e remarcações, volte à agenda. Conflitos continuam sendo verificados.', target: 'page-content', route: 'agenda' },
    ],
  },
  ...SPECIALTY.map((s): Tour => ({
    id: `consulta-${s.seg}`, title: `Consulta — ${s.title}`, audience: 'equipe', resource: s.resource, module: s.seg,
    description: 'Do atendimento agendado ao registro finalizado e adendo.',
    steps: [
      { title: 'Comece pela agenda', body: 'Abra o atendimento pelo horário na agenda ou pela fila da recepção quando o paciente chegar.', target: 'page-content', route: 'agenda' },
      { title: 'Ficha do paciente', body: 'Histórico, alergias e alertas ficam no topo do prontuário. Notas administrativas ficam separadas das clínicas.', target: 'page-content', route: 'pacientes' },
      { title: s.title, body: s.body, target: 'page-content', route: s.route },
      { title: 'Finalizar e adendo', body: 'Ao finalizar, o registro não pode mais ser sobrescrito. Correções viram adendo, com autor, data e motivo.', target: 'primary-action', route: s.route },
    ],
  })),
  {
    id: 'financeiro', title: 'Financeiro', audience: 'equipe', resource: 'financeiro', module: 'financeiro',
    description: 'Contas, recebimento parcial, estorno e caixa.',
    steps: [
      { title: 'Abra o financeiro', body: 'Contas a receber e a pagar, caixa por unidade e operador.', target: 'nav-financeiro', route: 'financeiro', minWidth: DESKTOP },
      { title: 'Visão geral', body: 'Diferencie competência, vencimento, recebimento e disponibilidade do dinheiro.', target: 'page-content', route: 'financeiro' },
      { title: 'Registrar recebimento', body: 'Recebimentos podem ser parciais. Estornos criam uma reversão vinculada; movimentos liquidados nunca são apagados.', target: 'primary-action', route: 'financeiro' },
      { title: 'Caixa', body: 'Abra o caixa no início do turno, registre sangrias e suprimentos e feche conferindo o valor esperado.', target: 'page-content', route: 'financeiro' },
    ],
  },
  {
    id: 'estoque', title: 'Estoque', audience: 'equipe', resource: 'estoque', module: 'estoque',
    description: 'Lotes, validade, consumo por procedimento e compras.',
    steps: [
      { title: 'Abra o estoque', body: 'Produtos com unidade de medida, lote, validade e fornecedor.', target: 'nav-estoque', route: 'estoque', minWidth: DESKTOP },
      { title: 'Saldos e lotes', body: 'Itens próximos do vencimento e abaixo do mínimo aparecem em destaque.', target: 'page-content', route: 'estoque' },
      { title: 'Movimentar', body: 'Entradas, saídas, perdas e ajustes ficam registrados. Procedimento concluído consome a ficha técnica uma única vez.', target: 'primary-action', route: 'estoque' },
      { title: 'Compras', body: 'Solicitação, aprovação, pedido e recebimento parcial alimentam o estoque e as contas a pagar.', target: 'page-content', route: 'compras' },
    ],
  },
  {
    id: 'marca-pwa', title: 'Marca e app (PWA)', audience: 'equipe', resource: 'marca',
    description: 'Logo, cores, prévia e instalação do app da clínica.',
    steps: [
      { title: 'Marca e app', body: 'Aqui ficam a identidade da clínica e os apps instaláveis da equipe e dos pacientes.', target: 'nav-marca', route: 'marca', minWidth: DESKTOP },
      { title: 'Identidade', body: 'Logo para fundo claro e escuro, símbolo do app e cor. Botões e textos têm contraste ajustado automaticamente.', target: 'page-content', route: 'marca' },
      { title: 'Publicar', body: 'Salvar atualiza as telas na hora. O ícone de um app já instalado pode demorar a mudar, conforme o sistema.', target: 'primary-action', route: 'marca' },
    ],
  },
  {
    id: 'super-admin', title: 'Super Admin', audience: 'master',
    description: 'Contratantes, planos, testes, integrações e custos.',
    steps: [
      { title: 'Painel da plataforma', body: 'MRR, ARR, testes, conversão e falhas de integração calculados a partir dos dados fictícios, com definição e período.', target: 'page-content', route: '/master' },
      { title: 'Contratantes', body: 'Clínicas, unidades, plano, status e histórico.', target: 'page-content', route: '/master/contratantes' },
      { title: 'Planos', body: 'Preços por ciclo, limites, franquias, excedentes e módulos. Os valores são de demonstração e alimentam o site comercial.', target: 'primary-action', route: '/master/planos' },
      { title: 'Testes', body: 'Duração, extensão com motivo, expiração e conversão do período de teste.', target: 'page-content', route: '/master/testes' },
      { title: 'Custos e margem', body: 'Consumo e custo estimado por contratante, com alertas de limite.', target: 'page-content', route: '/master/custos' },
    ],
  },
  {
    id: 'portal', title: 'Portal do paciente', audience: 'portal',
    description: 'Consultas, agendamento, documentos, pagamentos e preferências.',
    steps: [
      { title: 'Início', body: 'Próxima consulta, pendências, documentos liberados e pagamentos.', target: 'page-content', route: 'portal' },
      { title: 'Agendar', body: 'Escolha serviço, profissional e horário disponível. A confirmação segue a política da clínica.', target: 'page-content', route: 'portal/agendar' },
      { title: 'Documentos', body: 'Somente documentos liberados pela clínica aparecem aqui.', target: 'page-content', route: 'portal/documentos' },
      { title: 'Pagamentos', body: 'Pagamentos são simulados na demonstração; nenhum valor é cobrado.', target: 'page-content', route: 'portal/pagamentos' },
      { title: 'Preferências', body: 'Escolha por quais canais deseja receber avisos e lembretes.', target: 'page-content', route: 'portal/preferencias' },
    ],
  },
  {
    id: 'portal-tutor', title: 'Portal do tutor', audience: 'portal', module: 'veterinaria',
    description: 'Escolher o animal e acompanhar vacinas.',
    steps: [
      { title: 'Escolha o animal', body: 'Tutores com mais de um animal escolhem de quem é cada informação.', target: 'page-content', route: 'portal' },
      { title: 'Vacinas e vermifugação', body: 'Carteira por animal, com lote e data de retorno definida pelo veterinário.', target: 'page-content', route: 'portal/vacinas' },
      { title: 'Consultas', body: 'Histórico e próximas consultas de cada animal.', target: 'page-content', route: 'portal/consultas' },
    ],
  },
]

/** Passos aplicáveis ao tamanho de tela atual (o índice salvo no progresso refere-se a esta lista). */
export function stepsFor(tour: Tour, width: number): TourStep[] {
  return tour.steps.filter((s) => !s.minWidth || width >= s.minWidth)
}
