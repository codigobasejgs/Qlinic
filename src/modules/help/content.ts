// Conteúdo da Central de ajuda. Lógica pura (testável em node).
// `route`: relativa = tela da equipe (/app/:slug/<route>); absoluta com ':slug' = ambiente da clínica; '/master…' = Super Admin.
import type { Segment, TenantRole } from '@/domain/types'
import { normalize } from '@/lib/util'

export type HelpProfile = TenantRole | 'patient' | 'platform'
export const PROFILE_LABEL: Record<HelpProfile, string> = {
  clinic_owner: 'Proprietário', network_manager: 'Gestor da rede', unit_manager: 'Gestor da unidade', reception: 'Recepção',
  professional: 'Profissional', assistant: 'Auxiliar', finance: 'Financeiro', inventory: 'Estoque', patient: 'Paciente/tutor', platform: 'Equipe Qlinic',
}
export type HelpTask = 'primeiros-passos' | 'agenda' | 'atendimento' | 'especialidade' | 'financeiro' | 'suprimentos' | 'relacionamento' | 'gestao' | 'plataforma'
export const TASK_LABEL: Record<HelpTask, string> = {
  'primeiros-passos': 'Primeiros passos', agenda: 'Agenda e recepção', atendimento: 'Atendimento clínico', especialidade: 'Especialidades',
  financeiro: 'Financeiro', suprimentos: 'Estoque e compras', relacionamento: 'Relacionamento e portal', gestao: 'Gestão e configuração', plataforma: 'Super Admin',
}

export interface HelpArticle {
  slug: string
  title: string
  summary: string
  task: HelpTask
  profiles: HelpProfile[]
  /** Vazio = todos os segmentos. */
  segments: Segment[]
  prerequisites: string[]
  steps: string[]
  expected: string
  errors: { problem: string; fix: string }[]
  /** Tela real para abrir. */
  route: string
  /** Clínica de exemplo para links públicos. */
  demoSlug?: string
  /** Print real (id em public/screens via shots.json). */
  shot?: string
  tourId?: string
  faq?: { q: string; a: string }[]
}

export const ARTICLES: HelpArticle[] = [
  {
    slug: 'primeiro-acesso', title: 'Primeiro acesso e checklist inicial', task: 'primeiros-passos', profiles: ['clinic_owner', 'network_manager'], segments: [],
    summary: 'Configure organização, unidades, marca, equipe e políticas antes de abrir a agenda.',
    prerequisites: ['Perfil de proprietário ou gestor da rede.', 'Nome comercial, horários e lista de profissionais em mãos.'],
    steps: ['Abra “Configuração inicial” no menu Gestão.', 'Preencha organização e segmento; os módulos sugeridos já vêm marcados.', 'Cadastre unidades, horários, salas e equipamentos.', 'Envie logo e símbolo e confira a prévia clara e escura.', 'Convide a equipe e defina papéis.', 'Defina política de agendamento, sinal e cancelamento.', 'Marque cada item no checklist desta central.'],
    expected: 'Assistente concluído e checklist marcado; a agenda passa a oferecer horários conforme as regras definidas.',
    errors: [{ problem: 'Não encontro “Configuração inicial”.', fix: 'Ela aparece apenas para perfis com permissão de configurações (proprietário e gestores).' }, { problem: 'Saí no meio do assistente.', fix: 'O progresso é salvo; ao voltar, você continua da última etapa.' }],
    route: 'onboarding', shot: 'onboarding', tourId: 'onboarding',
  },
  {
    slug: 'agendar-sem-conflitos', title: 'Agendar e evitar conflitos', task: 'agenda', profiles: ['reception', 'unit_manager', 'professional', 'clinic_owner'], segments: [],
    summary: 'Crie atendimentos verificando profissional, sala, equipamento, horário de funcionamento e feriados.',
    prerequisites: ['Serviços e profissionais cadastrados.', 'Permissão de agenda.'],
    steps: ['Abra a Agenda e escolha a unidade, se houver mais de uma.', 'Clique em “Novo agendamento” ou em um horário livre.', 'Escolha paciente, serviço, profissional e recurso.', 'Revise os avisos de conflito antes de salvar.', 'Para reagendar ou cancelar, abra o atendimento e informe o motivo.'],
    expected: 'O atendimento aparece na grade com o status escolhido e entra no histórico do paciente.',
    errors: [{ problem: '“Conflito com outro atendimento”.', fix: 'O profissional ou o recurso já está ocupado. Escolha outro horário ou outro recurso.' }, { problem: 'Horário fora do expediente.', fix: 'Confira horários, feriados e ausências em Configurações.' }],
    route: 'agenda', shot: 'agenda', tourId: 'agenda',
    faq: [{ q: 'Posso arrastar atendimentos?', a: 'Sim, e sempre há alternativa pelo formulário de reagendamento, acessível por teclado.' }],
  },
  {
    slug: 'recepcao-check-in-totem', title: 'Recepção, check-in e totem', task: 'agenda', profiles: ['reception', 'unit_manager'], segments: [],
    summary: 'Acompanhe a fila do dia, registre chegadas e use o totem e o painel de chamada.',
    prerequisites: ['Permissão de recepção.', 'Para o totem: um tablet com a tela do totem aberta.'],
    steps: ['Abra a Recepção para ver a fila do dia por status.', 'Registre a chegada pelo balcão ou peça o check-in no totem com o QR de curta duração.', 'Confira documentos pendentes antes de liberar o atendimento.', 'Chame o paciente; o painel mostra nome abreviado ou senha.'],
    expected: 'O status muda para “Chegou” e o profissional vê o paciente na fila.',
    errors: [{ problem: 'QR expirado no totem.', fix: 'O token dura poucos minutos por segurança. Gere outro na recepção.' }, { problem: 'Não vejo alertas clínicos.', fix: 'Eles só aparecem para perfis com permissão clínica.' }],
    route: 'recepcao', shot: 'recepcao', tourId: 'recepcao', demoSlug: 'clinica-vitta',
    faq: [{ q: 'O totem mostra a lista de pacientes?', a: 'Não. Ele reinicia após cada pessoa e não exibe dados de terceiros.' }],
  },
  {
    slug: 'totem-e-painel', title: 'Abrir o totem e o painel de chamada', task: 'agenda', profiles: ['reception', 'unit_manager', 'clinic_owner'], segments: [],
    summary: 'Telas públicas da clínica para tablet de check-in e TV da sala de espera.',
    prerequisites: ['Página pública da clínica ativa.'],
    steps: ['Abra o endereço do totem no tablet da recepção.', 'Abra o painel na TV da sala de espera.', 'Ao chamar um paciente na recepção, o painel atualiza.'],
    expected: 'Totem pronto para check-in e painel exibindo chamadas com privacidade.',
    errors: [{ problem: 'Painel não atualiza em outra máquina.', fix: 'Na demonstração, a sincronização ocorre entre abas do mesmo navegador. Em produção será em tempo real pelo servidor.' }],
    route: '/c/:slug/totem', shot: 'totem', demoSlug: 'clinica-vitta',
  },
  {
    slug: 'consulta-finalizacao-adendo', title: 'Consulta, finalização e adendo', task: 'atendimento', profiles: ['professional'], segments: [],
    summary: 'Registre o atendimento, finalize e corrija com adendo, sem sobrescrever o registro.',
    prerequisites: ['Perfil profissional vinculado ao atendimento.'],
    steps: ['Abra o paciente pela agenda ou pela fila da recepção.', 'Registre a evolução no template da sua especialidade.', 'Salve o rascunho; alterações não salvas geram aviso ao sair.', 'Finalize o registro.', 'Para corrigir, adicione um adendo com motivo.'],
    expected: 'Registro finalizado com autor e data; adendos aparecem vinculados ao original.',
    errors: [{ problem: 'Não consigo editar um registro finalizado.', fix: 'É o comportamento esperado. Use “Adicionar adendo”.' }, { problem: 'Não vejo o prontuário de outro profissional.', fix: 'Seu perfil pode estar restrito aos próprios registros.' }],
    route: 'pacientes', shot: 'consulta', tourId: 'consulta-medicina', demoSlug: 'clinica-vitta',
  },
  {
    slug: 'odontograma-orcamento-aceite', title: 'Odontograma → orçamento → aceite', task: 'especialidade', profiles: ['professional', 'reception', 'clinic_owner'], segments: ['odontologia'],
    summary: 'Marque dentes e faces, gere o plano, monte o orçamento e envie o link de aceite.',
    prerequisites: ['Módulo de odontologia habilitado.', 'Procedimentos com preço cadastrados.'],
    steps: ['Abra Odontologia e escolha o paciente.', 'Selecione dente e face; registre condição e procedimento.', 'Adicione os itens ao plano de tratamento.', 'Gere o orçamento com opções, desconto permitido e parcelamento.', 'Envie o link; o paciente aceita total ou parcialmente.'],
    expected: 'Orçamento aceito atualiza o plano sem duplicar cobrança.',
    errors: [{ problem: 'Desconto bloqueado.', fix: 'O desconto ultrapassa o limite do seu perfil. Peça aprovação ao gestor.' }],
    route: 'odontologia', shot: 'odontograma', tourId: 'consulta-odontologia', demoSlug: 'sorriso-pleno',
    faq: [{ q: 'O odontograma faz diagnóstico?', a: 'Não. A marcação é registro do profissional, nunca diagnóstico automático.' }],
  },
  {
    slug: 'veterinaria-vacinas-internacao', title: 'Veterinária: vacinas por animal e internação', task: 'especialidade', profiles: ['professional', 'assistant', 'reception'], segments: ['veterinaria'],
    summary: 'Carteira de vacinação por animal com lote e retorno, e internação com tarefas por horário.',
    prerequisites: ['Módulo de veterinária habilitado.', 'Tutor e animal cadastrados.'],
    steps: ['Abra Veterinária e escolha o animal.', 'Registre vacina com produto, lote e data de retorno definida por você.', 'Para internar, escolha o box e registre a admissão.', 'Lance prescrições e marque cada administração no horário.', 'Registre a alta.'],
    expected: 'Vacinas aparecem no portal do tutor; a internação mostra o que foi agendado e o que foi administrado.',
    errors: [{ problem: 'Data de retorno vazia.', fix: 'O retorno é definido pelo veterinário; o sistema não assume reforço anual.' }],
    route: 'veterinaria', shot: 'veterinaria', tourId: 'consulta-veterinaria', demoSlug: 'vet-amigo',
  },
  {
    slug: 'psicologia-sigilo', title: 'Psicologia e sigilo', task: 'especialidade', profiles: ['professional', 'reception', 'clinic_owner'], segments: ['psicologia'],
    summary: 'Registros de sessão com acesso restrito e cuidados no atendimento de menores.',
    prerequisites: ['Módulo de psicologia habilitado.'],
    steps: ['Abra Psicologia; só o profissional responsável vê o conteúdo das sessões.', 'Use agenda recorrente para sessões semanais.', 'Libere ao portal apenas documentos escolhidos.', 'Para menores, configure o que o responsável pode ver.'],
    expected: 'Recepção e gestão enxergam agenda e financeiro, nunca o conteúdo das sessões.',
    errors: [{ problem: 'A recepção pede para ver a sessão.', fix: 'Não é possível pelo perfil de recepção. Isso é intencional.' }],
    route: 'psicologia', shot: 'psicologia', tourId: 'consulta-psicologia', demoSlug: 'espaco-escuta',
    faq: [{ q: 'O sigilo é garantido?', a: 'Na demonstração é uma regra de interface. Em produção depende de autorização no servidor e de políticas da clínica.' }],
  },
  {
    slug: 'financeiro-parcial-estorno-caixa', title: 'Financeiro: parcial, estorno e caixa', task: 'financeiro', profiles: ['finance', 'reception', 'clinic_owner', 'unit_manager'], segments: [],
    summary: 'Receba parcialmente, estorne com vínculo e feche o caixa conferindo o esperado.',
    prerequisites: ['Permissão de financeiro ou de caixa.'],
    steps: ['Abra o caixa do seu turno.', 'Registre o recebimento; ele pode ser parcial.', 'Para estornar, abra o pagamento e informe o motivo; é criada uma reversão vinculada.', 'Registre sangrias e suprimentos.', 'Feche o caixa conferindo o valor esperado.'],
    expected: 'Saldo da cobrança atualizado e movimento auditável; nada liquidado é apagado.',
    errors: [{ problem: 'Diferença no fechamento.', fix: 'Confira sangrias e suprimentos; registre a diferença com justificativa.' }],
    route: 'financeiro', shot: 'financeiro', tourId: 'financeiro', demoSlug: 'sorriso-pleno',
  },
  {
    slug: 'comissoes', title: 'Comissões e repasses', task: 'financeiro', profiles: ['finance', 'clinic_owner', 'professional'], segments: [],
    summary: 'Regras por profissional e procedimento com memória de cálculo.',
    prerequisites: ['Módulo de comissões habilitado.'],
    steps: ['Abra Comissões e repasses.', 'Crie ou revise regras por profissional, procedimento e período.', 'Escolha base bruta ou líquida e descontos considerados.', 'Execute o cálculo do período e confira a memória.', 'Ajustes exigem autorização.'],
    expected: 'Repasse calculado com snapshot da regra usada.',
    errors: [{ problem: 'Profissional não vê comissões de outros.', fix: 'Profissionais veem apenas os próprios valores.' }],
    route: 'comissoes', shot: 'comissoes', demoSlug: 'sorriso-pleno',
    faq: [{ q: 'O repasse é pago automaticamente?', a: 'Não. É um cálculo gerencial; não equivale a split bancário executado por gateway.' }],
  },
  {
    slug: 'estoque-consumo-lote', title: 'Estoque: consumo e lote', task: 'suprimentos', profiles: ['inventory', 'assistant', 'unit_manager'], segments: [],
    summary: 'Lotes, validade, consumo por procedimento e prevenção de saldo negativo.',
    prerequisites: ['Módulo de estoque habilitado.'],
    steps: ['Abra Estoque e confira itens próximos do vencimento.', 'Registre entradas com lote e validade.', 'Procedimentos concluídos consomem a ficha técnica uma única vez.', 'Registre perdas e ajustes com motivo.'],
    expected: 'Saldo por lote coerente e rastreável.',
    errors: [{ problem: 'Saída bloqueada por saldo insuficiente.', fix: 'A regra impede estoque negativo. Registre a entrada pendente ou ajuste com motivo.' }],
    route: 'estoque', shot: 'estoque', tourId: 'estoque', demoSlug: 'vet-amigo',
  },
  {
    slug: 'crm', title: 'CRM e propostas', task: 'relacionamento', profiles: ['reception', 'clinic_owner', 'unit_manager'], segments: [],
    summary: 'Funil de contatos, tarefas, propostas e motivo de perda.',
    prerequisites: ['Módulo de CRM habilitado.'],
    steps: ['Abra o CRM e veja os contatos por etapa.', 'Mova um cartão arrastando ou pelo menu do cartão.', 'Registre tarefas e o histórico de contato.', 'Ao perder, informe o motivo.'],
    expected: 'Funil atualizado; propostas vinculadas ao contato.',
    errors: [{ problem: 'Cartão mostra diagnóstico.', fix: 'Não deve. Cartões comerciais não exibem informação clínica.' }],
    route: 'crm', shot: 'crm', demoSlug: 'lumiere-estetica',
  },
  {
    slug: 'portal-do-paciente', title: 'Portal do paciente e do tutor', task: 'relacionamento', profiles: ['patient', 'reception'], segments: [],
    summary: 'Consultas, agendamento, documentos liberados, pagamentos e preferências.',
    prerequisites: ['Acesso ao portal da clínica.'],
    steps: ['Entre no portal da clínica.', 'Tutores escolhem o animal; responsáveis escolhem o dependente.', 'Agende, confirme ou reagende conforme a política da clínica.', 'Veja documentos liberados e pagamentos.', 'Ajuste canais de aviso em Preferências.'],
    expected: 'Ações do portal aparecem para a equipe na agenda e no financeiro.',
    errors: [{ problem: 'Não vejo um documento.', fix: 'Somente documentos liberados pela clínica aparecem no portal.' }],
    route: '/c/:slug/portal', shot: 'portal-mobile', tourId: 'portal', demoSlug: 'vet-amigo',
  },
  {
    slug: 'marca-e-pwa', title: 'Marca e app (PWA)', task: 'gestao', profiles: ['clinic_owner', 'network_manager'], segments: [],
    summary: 'Logo, símbolo, cores e apps instaláveis da equipe e dos pacientes.',
    prerequisites: ['Permissão de marca.'],
    steps: ['Abra “Marca e app (PWA)”.', 'Envie logo para fundo claro e escuro e o símbolo do app.', 'Escolha a cor; o contraste é ajustado automaticamente.', 'Confira as prévias e publique.'],
    expected: 'Telas atualizadas com a nova identidade; o app instalado segue as regras do sistema operacional.',
    errors: [{ problem: 'O ícone do app instalado não mudou.', fix: 'Sistemas podem demorar a atualizar. Às vezes é preciso reinstalar.' }, { problem: 'Instalar não aparece no iPhone.', fix: 'No Safari, toque em Compartilhar → Adicionar à Tela de Início.' }],
    route: 'marca', shot: 'marca', tourId: 'marca-pwa',
  },
  {
    slug: 'integracoes-simuladas', title: 'Integrações simuladas', task: 'gestao', profiles: ['clinic_owner', 'network_manager'], segments: [],
    summary: 'Pagamentos, WhatsApp, e-mail e IA: estados, testes simulados e limites.',
    prerequisites: ['Permissão de configurações.'],
    steps: ['Abra Configurações e a seção de integrações.', 'Veja o estado de cada provedor: desconectado, conectado, degradado ou simulado.', 'Rode um teste simulado e confira o log sanitizado.', 'Campos de chave ficam desabilitados: a configuração real será no servidor.'],
    expected: 'Fluxos de envio e cobrança marcados como “Simulado — sem envio/cobrança real”.',
    errors: [{ problem: 'Quero colar minha chave de API.', fix: 'Não é permitido no navegador. Credenciais reais serão configuradas apenas no servidor.' }],
    route: 'configuracoes', shot: 'configuracoes',
  },
  {
    slug: 'importacao', title: 'Importação de dados', task: 'gestao', profiles: ['clinic_owner', 'network_manager'], segments: [],
    summary: 'Importe CSV com mapeamento, prévia, erros por linha e desfazer.',
    prerequisites: ['Arquivo CSV com dados fictícios.'],
    steps: ['Abra Importação e escolha a entidade.', 'Baixe o modelo se precisar.', 'Envie o arquivo e mapeie as colunas.', 'Revise duplicados e erros por linha.', 'Confirme; o lote pode ser desfeito.'],
    expected: 'Relatório do lote com linhas importadas e rejeitadas.',
    errors: [{ problem: 'Linha rejeitada por campo obrigatório.', fix: 'Corrija no arquivo e reenvie apenas as linhas com erro.' }],
    route: 'importacao', shot: 'importacao',
    faq: [{ q: 'Importa backup de outro sistema?', a: 'Não sem análise. Migração real exige amostra autorizada e reconciliação.' }],
  },
  {
    slug: 'permissoes-visualizar-como', title: 'Permissões e “visualizar como”', task: 'gestao', profiles: ['clinic_owner', 'network_manager'], segments: [],
    summary: 'Matriz por recurso, ação e unidade, e simulação da interface de outro perfil.',
    prerequisites: ['Permissão de equipe.'],
    steps: ['Abra Permissões para ver a matriz por papel.', 'No menu do usuário, escolha “Visualizar como outro perfil”.', 'Navegue para conferir o que aquele perfil vê.', 'Saia da simulação pela faixa amarela no topo.'],
    expected: 'Você confirma, na prática, o que cada perfil acessa.',
    errors: [{ problem: 'A opção não aparece.', fix: 'Apenas perfis que gerenciam a equipe podem simular outros perfis.' }],
    route: 'permissoes', shot: 'permissoes', demoSlug: 'sorriso-pleno',
  },
  {
    slug: 'super-admin-planos-testes', title: 'Super Admin: planos e testes', task: 'plataforma', profiles: ['platform'], segments: [],
    summary: 'Preços por ciclo, limites, excedentes, módulos e período de teste.',
    prerequisites: ['Perfil da equipe Qlinic.'],
    steps: ['Abra Planos no Super Admin.', 'Edite preços por ciclo, limites e excedentes.', 'Os valores aparecem no site comercial como “demonstração”.', 'Em Testes, estenda com motivo ou converta.'],
    expected: 'Plano salvo com nova versão; site comercial atualizado.',
    errors: [{ problem: 'Suporte não vê planos.', fix: 'O perfil de suporte não acessa cobrança e planos.' }],
    route: '/master/planos', shot: 'master', tourId: 'super-admin',
  },
]

export const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Adendo', def: 'Complemento a um registro clínico finalizado, com autor, data e motivo. Não altera o original.' },
  { term: 'Data-base da demonstração', def: 'Data de referência usada para gerar agenda e históricos fictícios.' },
  { term: 'Excedente', def: 'Consumo acima da franquia do plano (mensagens, armazenamento, IA), cobrado por unidade.' },
  { term: 'Franquia', def: 'Quantidade incluída no plano a cada mês.' },
  { term: 'Host-only', def: 'Sessão válida apenas no endereço de uma clínica, sem compartilhar login entre clínicas.' },
  { term: 'MFA', def: 'Verificação em duas etapas: senha mais um código de aplicativo autenticador.' },
  { term: 'Odontograma', def: 'Mapa dos dentes onde o profissional registra condições e procedimentos por face.' },
  { term: 'PWA', def: 'App web instalável pelo navegador, com nome, ícone e cor próprios, sem loja de aplicativos.' },
  { term: 'Recurso', def: 'Sala, cadeira ou equipamento que pode gerar conflito de agenda.' },
  { term: 'Simulado', def: 'Fluxo que imita uma integração externa sem enviar, cobrar ou autenticar de verdade.' },
  { term: 'Tenant', def: 'Organização contratante (clínica ou rede) com dados separados das demais.' },
  { term: 'Totem', def: 'Tela de check-in para tablet na recepção; reinicia após cada pessoa.' },
  { term: 'Visualizar como', def: 'Simulação da interface com as permissões de outro perfil, para conferência.' },
]

export const CHECKLIST: { id: string; label: string; route: string }[] = [
  { id: 'org', label: 'Dados da organização e segmento', route: 'onboarding' },
  { id: 'units', label: 'Unidades, horários e feriados', route: 'configuracoes' },
  { id: 'brand', label: 'Logo, símbolo e cor da marca', route: 'marca' },
  { id: 'team', label: 'Equipe convidada e papéis definidos', route: 'permissoes' },
  { id: 'services', label: 'Serviços com duração e preço', route: 'configuracoes' },
  { id: 'policy', label: 'Política de agendamento e cancelamento', route: 'configuracoes' },
  { id: 'agenda', label: 'Primeiro agendamento de teste', route: 'agenda' },
  { id: 'portal', label: 'Página pública e portal revisados', route: 'marca' },
]

export const HELP_FAQ: { q: string; a: string }[] = [
  { q: 'Existem vídeos de treinamento?', a: 'Ainda não. O treinamento atual é textual, com prints reais e tours guiados dentro do sistema.' },
  { q: 'Os dados que eu alterar ficam salvos?', a: 'Somente neste navegador. Use “Restaurar dados” na demonstração para voltar ao estado inicial.' },
  { q: 'Por que um tour diz que o elemento não está visível?', a: 'O perfil pode não ter acesso àquela ação ou a tela é pequena. O tour continua sem bloquear seu trabalho.' },
]

export function articleBySlug(slug: string | undefined) { return ARTICLES.find((a) => a.slug === slug) }

export function searchArticles(list: HelpArticle[], q: string, opts: { profile?: HelpProfile | ''; segment?: Segment | ''; task?: HelpTask | '' } = {}) {
  const terms = normalize(q).split(/\s+/).filter(Boolean)
  return list.filter((a) => {
    if (opts.profile && !a.profiles.includes(opts.profile)) return false
    if (opts.segment && a.segments.length && !a.segments.includes(opts.segment)) return false
    if (opts.task && a.task !== opts.task) return false
    if (!terms.length) return true
    const hay = normalize([a.title, a.summary, ...a.steps, ...a.errors.map((e) => e.problem + ' ' + e.fix), ...(a.faq ?? []).map((f) => f.q)].join(' '))
    return terms.every((t) => hay.includes(t))
  })
}

/** Link da tela real: equipe usa a base do tenant; público passa pelo seletor quando exige perfil. */
export function articleHref(a: HelpArticle, ctx: { base: string; slug: string } | null, demoLink: (route: string, slug?: string) => string): string {
  if (ctx) {
    if (a.route.startsWith('/master')) return a.route
    if (a.route.startsWith('/')) return a.route.replace(':slug', ctx.slug)
    return `${ctx.base}/${a.route}`
  }
  return demoLink(a.route, a.demoSlug)
}
