# QLINIC — PROMPT MESTRE PARA CLAUDE CODE

Versão 1.0 · 27/10/2026 · Especificação de produto e execução do frontend completo.

Copie este documento integralmente ou anexe ao Claude Code dentro da pasta do projeto. O nome Qlinic e o domínio exemplificado são provisórios; disponibilidade de marca/domínio não foi confirmada. Este documento não afirma superioridade comprovada sobre concorrentes nem certificação clínica, fiscal ou jurídica.

---

## 1. Missão e ordem de execução

Atue como equipe sênior de produto, arquitetura SaaS, desenvolvimento frontend, design de interação, acessibilidade e QA. Implemente o Qlinic: ERP SaaS multi-tenant e multiunidade para odontologia, medicina ambulatorial, veterinária, estética, psicologia, fisioterapia e nutrição. O produto deve atender tanto ao administrador da plataforma quanto às clínicas, profissionais, recepcionistas, pacientes, tutores e responsáveis.

Execute o trabalho, não entregue apenas planejamento ou uma landing. O objetivo imediato é TODO o frontend descrito, com navegação, formulários, regras de apresentação, fluxos integrados e persistência demonstrativa. Use incrementos internos verificáveis sem reduzir silenciosamente o escopo.

Ordem obrigatória:
1. Inspeção do repositório e plano rastreável.
2. Design system e arquitetura frontend.
3. Implementação de todos os ambientes, módulos e demonstrações.
4. PWA, responsividade, acessibilidade, treinamento e QA.
5. Preparação para GitHub e deploy de demonstração na Vercel.
6. Em etapa posterior autorizada: backend Supabase, integrações reais, domínio e Cloudflare.

Nesta execução, não provisionar backend, não ativar cobrança/envio real e não alterar DNS. Preparar contratos de serviço e documentação. Se repositório remoto e projeto Vercel já estiverem indicados e autorizados, publicar apenas a demonstração após validação; caso contrário, entregar comandos exatos e solicitar somente o destino faltante. Nunca inventar URL publicada, credencial ou resultado de teste.

Não interromper para pedir aprovação de cada tela ou escolha rotineira. Documentar suposições e continuar. Se uma dependência impedir uma função externa, concluir sua interface e contrato de integração, identificando precisamente a pendência. Não usar isso para justificar telas vazias.

## 2. Inspeção e proteção do trabalho existente

Ler AGENTS.md, README, package.json, lockfile, estrutura, git status, configuração de build e convenções existentes. Preservar mudanças do usuário; não usar reset destrutivo, force push ou substituição integral de projeto sem necessidade. Reutilizar a stack compatível existente. Num repositório novo, adotar React, TypeScript estrito e Vite, com roteamento, formulários validados e camada de repositórios. Uma stack Next.js já existente pode ser preservada, documentando diferenças.

Verificar compatibilidade das versões antes de instalar dependências. Usar um único gerenciador de pacotes e lockfile. Evitar bibliotecas duplicadas para a mesma função. Não colocar integrações externas diretamente nos componentes.

Entregar desde cedo docs/ESCOPO_E_STATUS.md com uma linha por requisito, ambiente, rota, implementação, teste e dependência externa. Estados separados: não iniciado, frontend implementado, frontend validado, integração futura. O plano não substitui a execução.

## 3. Princípios de experiência

Premium significa hierarquia, precisão, fluidez e legibilidade. Interface limpa, com densidade adequada para operação clínica; evitar excesso de cartões, gradientes, efeitos de vidro, sombras pesadas e dashboards decorativos.

Idioma pt-BR, moeda BRL, datas legíveis, fuso por unidade e regras de horário explícitas. Persistir timestamps em formato adequado à futura conversão UTC. Diferenciar data civil, como nascimento, de instante com fuso.

Toda ação deve produzir efeito observável, feedback e tratamento de erro. Não aceitar botões que apenas mostram toast de sucesso sem alterar estado. Nenhuma rota de menu deve terminar em página genérica de construção.

Fluxos externos podem ser simulados, mas com identificação consistente: faixa de demonstração e estado “Simulado — sem envio/cobrança real”. O produto não deve confundir simulação com operação.

## 4. Design system e identidade

Marca provisória Qlinic. Se a referência visual estiver disponível no repositório, usá-la. Caso contrário, criar marca tipográfica e símbolo Q simples e consistente, sem alegar reprodução exata de arquivo ausente.

Paleta base:
- Primária: #0D9488.
- Texto/navegação: #102A43.
- Realce: #5EEAD4.
- Fundo: #F7FAFC.
- Texto secundário: #64748B.

Esses valores são ponto de partida, não autorização para combinações de baixo contraste. Criar tokens semânticos para fundos, superfícies, texto, borda, foco, ação, alerta, sucesso e erro; testar contraste em light e dark. Derivar variantes acessíveis da cor de cada cliente. Cores de status não devem mudar arbitrariamente com a marca.

Tipografia legível, ícones de uma família consistente, escala de espaçamento de base 4/8, bordas discretas, raios moderados. Fontes com fallback e carregamento eficiente. Animações curtas e respeito a prefers-reduced-motion.

Componentes mínimos: botões, campos, máscaras, combobox acessível, seletor de data, filtros, abas, tabelas, listas móveis, drawers, diálogos, alertas, timeline, calendário, upload, comparação de imagens, assinatura demonstrativa, editor de documento, skeleton, empty state, error state, breadcrumbs, paginação, command palette e notificações.

Desktop: sidebar recolhível, cabeçalho contextual, seletor de unidade e área central. Tablet: painel adaptado ao toque e uso em orientação horizontal/vertical. Celular: navegação por tarefas prioritárias, ações alcançáveis, drawers de tela inteira quando necessário, sem copiar sidebar desktop reduzida. Não esconder funções essenciais no mobile.

Tabelas com muitas colunas devem oferecer lista/cartões ou seleção de colunas no celular. Odontogramas/mapas podem usar zoom e pan dentro do componente, nunca causar rolagem horizontal da página inteira.

Objetivo WCAG 2.2 AA: teclado, foco visível, labels, mensagens de erro vinculadas, semântica, contraste, área de toque confortável, zoom 200%, leitura por leitor de tela e alternativas ao arrastar. Não declarar certificação automática.

## 5. Tenancy, hierarquia e permissões

Modelar Tenant/Organization → Units → Memberships/Users. Uma organização pode ter várias unidades/CNPJs. Clínicas contratantes distintas não compartilham prontuários, contatos, mídia ou finanças por padrão. Mesmo CPF em duas organizações não autoriza merge entre elas.

Separar: usuário autenticável, vínculo profissional, paciente humano, tutor, animal, responsável legal e responsável financeiro. Um usuário pode ter vários vínculos, com escopo explícito.

Papéis base: proprietário da plataforma, operador financeiro SaaS, suporte SaaS, proprietário da clínica, gestor da rede, gestor da unidade, recepção, profissional, auxiliar, financeiro, estoque, paciente, tutor e responsável. Cada permissão deve considerar recurso + ação + unidade + vínculo, com opção de restringir acesso a registros próprios.

Criar matriz visual de permissões e simulação “visualizar como perfil”. Perfil de suporte da plataforma não recebe leitura automática de prontuários. Acesso assistido futuro exige motivo, autorização, prazo, registro e indicação visível. No frontend, demonstrar sem alegar segurança real.

Separar feature flags, limites do plano e permissões do usuário. Módulo habilitado não concede autorização automaticamente.

Ao trocar organização, limpar queries, drafts sensíveis, seleções, conexões demonstrativas e estado derivado. Incluir tenantId e unitId nas chaves de dados quando aplicáveis. O tenant recebido de URL é contexto, não prova de autorização.

## 6. Ambientes e rotas

Implementar com estrutura equivalente a:
- / — site comercial Qlinic.
- /segmentos/:segmento, /planos, /recursos, /ajuda — páginas públicas.
- /demonstracao — escolher clínica fictícia, perfil e dispositivo sugerido.
- /auth/* — login, recuperação, convite, verificação e MFA demonstrativos.
- /master/* — Super Admin Qlinic.
- /app/:tenantSlug/* — equipe da clínica.
- /c/:tenantSlug — página pública da clínica.
- /c/:tenantSlug/agendar — agendamento.
- /c/:tenantSlug/portal/* — paciente/tutor.
- /c/:tenantSlug/totem — check-in demonstrativo.
- /c/:tenantSlug/painel — chamada com privacidade.
- /c/:tenantSlug/proposta/:token — orçamento demonstrativo.

Essas rotas permitem desenvolvimento por paths. A arquitetura deve aceitar futura resolução por hostname verificado, com subdomínio ou domínio próprio. Não assumir que trocar o path produz isolamento de origem. Criar TenantResolver e documentar a transição de rotas.

## 7. Super Admin: gestão completa do SaaS

Implementar:
1. Dashboard: MRR, ARR, clientes ativos, testes, conversão, churn, inadimplência SaaS, uso de armazenamento/mensagens/IA e falhas de integrações. Métricas calculadas a partir do seed, com definição e período; não números desconexos.
2. Contratantes: cadastro, unidades, responsáveis, segmento, status, plano, histórico e filtros.
3. Planos: mensal/trimestral/anual, limites, módulos, usuários/profissionais/unidades, armazenamento, franquias de consumo, excedentes e regras de upgrade/downgrade. Preços de demonstração claramente editáveis, sem apresentá-los como decisão comercial definitiva.
4. Testes: duração configurável, início/fim, extensão com motivo, expiração e conversão.
5. Assinaturas: ciclo, vencimento, cupons, descontos com validade, cancelamento, pausa, reativação e histórico.
6. Cobrança da plataforma: cobranças SaaS, pagamentos, estornos, conciliação e gateways da própria Qlinic.
7. Integrações: saúde por provedor/tenant, consumo, erros sanitizados, filas simuladas, tentativas e eventos.
8. Domínios e PWA: configuração por cliente, hostname, verificação, certificado, versão de identidade e diagnóstico demonstrativo.
9. Suporte: tickets, prioridade, responsável, SLA configurável, anexos fictícios e acesso assistido.
10. Operação: feature flags, incidentes, avisos, changelog e status do serviço.
11. Governança: usuários internos, permissões, auditoria e solicitações de exportação/encerramento.
12. Visão de custos: consumo e custo estimado por tenant, margem SaaS e alertas de limite.

Não misturar receita dos pacientes com MRR da plataforma. Não calcular ARR a partir de volume financeiro transacionado. Suspensão comercial não deve apagar dados nem bloquear indiscriminadamente mecanismos de exportação/continuidade; documentar a política para validação posterior.

## 8. Onboarding e configurações de cada empresa

Wizard com salvamento e retomada:
1. Organização, nome comercial, documento, endereço e contatos.
2. Segmento principal e módulos adicionais.
3. Unidades, horários, fuso, salas, cadeiras e equipamentos.
4. Logo, símbolo do aplicativo, cores, tema e prévia light/dark.
5. Equipe, profissionais, papéis e serviços.
6. Política de agendamento, sinal, cancelamento e confirmação.
7. Página pública, slug, domínio desejado e informações publicáveis.
8. Comunicação, remetente de email, WhatsApp e notificações.
9. Pagamentos da clínica, conta recebedora e meios permitidos.
10. Prévia desktop/mobile/PWA e checklist de configuração.

Configurações devem incluir informações comerciais e profissionais, logo de documentos, contatos, links, dados bancários demonstrativos, horários especiais, feriados, templates, limites e preferências. Usar regras por rede com overrides permitidos por unidade. Mostrar herança e restauração do padrão.

Upload de logo: validar tipo/tamanho, corte, fundo, prévia de ícone e variante para dark. PNG/JPEG/WebP como padrão; SVG só com sanitização apropriada. Logo completo pode não funcionar como ícone: permitir símbolo separado, área segura e fallback de iniciais.

Salvar a identidade deve atualizar interfaces e prévias imediatamente. No futuro, publicação de identidade envolve arquivos de ícone versionados e manifesto servido por HTTPS. Não prometer mudança instantânea de ícone já instalado em todos os sistemas.

## 9. Agenda, recepção e chegada

Agenda dia/semana/mês/lista por profissional, sala, cadeira, unidade e procedimento. Criar, editar, mover, cancelar e reagendar com motivo. Arrastar opcional com alternativa por formulário.

Validações: duração, buffer, horário de funcionamento, ausência, feriado, sobreposição de profissional e recurso, recorrência e conflito ao editar série. Timezone e virada de dia coerentes. Exibir disponibilidade calculada.

Status de consulta: solicitada, aguardando confirmação, confirmada, chegou, em atendimento, concluída, faltou e cancelada. Transições válidas e histórico. Separar status clínico, de agendamento e financeiro.

Lista de espera com disponibilidade, duração e prioridade operacional. Cancelamento pode gerar oferta temporária. Simular expiração e duas pessoas disputando a vaga; reserva definitiva futura precisa de transação no servidor.

Recepção: busca rápida, cadastro progressivo, documentos pendentes, fila, tempos, responsável e recebimentos autorizados. Alertas clínicos sensíveis aparecem somente para quem tem permissão.

Check-in: QR com token demonstrativo de curta duração; QR nunca contém prontuário. Totem deve reiniciar a sessão após cada pessoa, não listar todos os pacientes nem expor dados de terceiros. Painel de chamada usa senha/nome abreviado conforme configuração.

## 10. Cadastro e prontuário

Paciente: identificação, contatos, responsáveis, preferências de comunicação, convênio, documentos, permissões de compartilhamento e linha do tempo. Duplicidade gera sugestão e revisão; não mesclar automaticamente.

Prontuário: histórico, anamnese, problemas/alergias, evolução, exames, imagens, documentos, planos e procedimentos. Templates por especialidade com schema versionado. Campos clínicos importantes devem ser estruturados, não armazenar todo o domínio num JSONB genérico.

Estados: rascunho, revisado, finalizado e adendo. Registro finalizado não é sobrescrito silenciosamente; correção gera adendo com autor/data/motivo. Interface de assinatura é demonstração enquanto provedor não estiver integrado.

Construtor de formulários: texto, número, data, opção única/múltipla, seção e condição simples, obrigatório e validação; prévia e versão. Formulários antigos preservam a versão respondida.

Modo consulta: tela concentrada em histórico e registro, salvamento demonstrativo, alerta de mudanças não salvas, finalização e orientações. Separar informação clínica de notas administrativas.

Arquivos: galeria, categorização, upload, progressão, falha, substituição versionada e acesso. Dados fictícios exclusivamente nesta fase. Futuramente storage privado, links temporários e autorização por registro. Não comprimir destrutivamente originais diagnósticos ou DICOM; miniaturas são derivadas separadas. Visualizador DICOM diagnóstico é integração específica, não um viewer JPEG com outro nome.

## 11. Módulos por especialidade — todos no frontend

### Odontologia
Odontograma 2D interativo real com dentição permanente/decídua e identificação consistente. Selecionar dente/face, condição e procedimento; alimentar plano e orçamento. Histórico e legenda, teclado e versão mobile. Não confundir marcação visual com diagnóstico automático. 3D é extensão posterior opcional; não sacrificar precisão do 2D por efeito visual.
Periodontograma com campos e validações estruturais, ortodontia e manutenções, alinhadores e etapas, próteses/laboratório: solicitado, enviado, recebido, ajuste, entregue; custos, prazo e vínculo ao tratamento. Imagens intraorais com upload demonstrativo e adaptador futuro de dispositivo. Esterilização: lotes/ciclos, indicadores registrados, responsável, validade e vínculo com kits/procedimentos, sem declarar conformidade automática.

### Medicina ambulatorial
Evolução SOAP configurável, sinais vitais, exames solicitados/recebidos, encaminhamentos, retornos, receitas e atestados em rascunho. Diretório de especialidades e templates. Convênios: carteirinha, elegibilidade simulada, autorização, guias, lotes, glosa, recurso e conciliação. TISS/TUSS como integração versionada futura; na fase frontend gerar somente artefato demonstrativo claramente marcado, não XML alegadamente homologado. Pediatria: entrada de medidas e curva de exemplo; curvas clínicas reais dependem de referência validada, sem percentis inventados.

### Veterinária
Tutor → vários animais; responsáveis e pagador separados. Espécie, raça, sexo, idade/data estimada, peso com histórico, pelagem e microchip. Carteira de vacinação/vermifugação com produto, lote, profissional e data de retorno definida pelo veterinário; não assumir reforço anual universal.
Internação demonstrativa: mapa de boxes, admissão, evolução, prescrição profissional, tarefas por horário, registro de administração e alta. Diferenciar agendado de administrado. Banho/tosa opcional: serviços, agenda, observações, autorização e entrega.
Calculadora opcional de conversão apenas com dose prescrita inserida pelo profissional: unidades explícitas, concentração, peso, validação e resultado como cálculo; não sugerir medicamento/dose, não aplicar fórmula sem espécie/contexto, não gravar prescrição automaticamente. Incluir casos de unidade incompatível e dado ausente.

### Estética
Mapa corporal/facial com pontos, regiões e observações; produto, unidades/volume, lote e profissional. Pacotes e sessões previstas/realizadas, consumo e validade contratual. Comparador antes/depois com alinhamento e consentimento por finalidade; uso clínico e publicitário separados. Simulação estética nunca apresentada como resultado garantido.

### Psicologia
Agenda recorrente, plano de acompanhamento e registros com acesso especialmente restrito. Recepção não acessa conteúdo de sessão. Portal mostra apenas documentos explicitamente liberados. Controles para atendimento de menores e responsáveis, sem presumir compartilhamento integral.

### Fisioterapia
Avaliação funcional, metas, plano de sessões, evolução e prescrição de exercícios pelo profissional. Lista e mídia demonstrativa, adesão declarada pelo paciente e relatórios.

### Nutrição
Anamnese alimentar, medidas, evolução e plano estruturado editado pelo profissional. Comparação de avaliações e portal. Não gerar dieta terapêutica ou metas clínicas automáticas sem revisão.

### Equipes multidisciplinares
Plano de cuidado compartilhado com granularidade de acesso e liberação; encaminhamentos internos, tarefas e responsáveis. Não unir prontuários entre tenants por conveniência.

## 12. CRM, propostas e relacionamento

Kanban configurável: novo contato, qualificação, agendamento, avaliação, proposta, negociação, convertido, perdido. Origem, responsável, tarefas, histórico e motivo de perda. Arrastar com alternativa acessível. Não expor diagnóstico em cartões comerciais.

Orçamento: itens/procedimentos, versões, desconto permitido, opções, validade, parcelamento, condições, responsável financeiro e custos previstos. Valores monetários em centavos; arredondamento consistente. Aprovação parcial deve atualizar plano sem duplicar cobrança.

Link interativo de proposta: visual da clínica, explicações, alternativas, perguntas, aceite/rejeição, assinatura demonstrativa e pagamento simulado. Links sensíveis futuros exigem autorização adequada, expiração/revogação e proteção contra acesso por simples adivinhação. Não publicar exames sem autenticação adequada; no protótipo usar apenas mídia fictícia.

Controle de indicação e satisfação com opt-out e limites. Evitar campanhas que exponham condições de saúde ou alegações de resultado garantido. Mensagens de relacionamento devem poder virar atendimento humano.

## 13. Financeiro da clínica e estoque

Financeiro: contas a pagar/receber, caixa por unidade/operador, abertura/fechamento, sangria/suprimento, categorias, centros de custo, fornecedores, parcelas, acordos, recebimentos parciais, juros/descontos configurados, estorno, chargeback e reembolso. Diferenciar competência, vencimento, recebimento e disponibilidade do dinheiro. Não apagar movimentos liquidados; criar reversões vinculadas.

Comissões e repasses internos: regra por profissional, procedimento, faixa e período; base bruta/líquida, taxas, laboratório, insumos e descontos; regra versionada e snapshot do cálculo na execução. Mostrar memória de cálculo e ajuste autorizado. Repasse gerencial NÃO equivale a split bancário executado pelo gateway.

Simulador de precificação: custos fixos, capacidade/ocupação, duração, insumos, impostos informados, taxas e repasse. Exibir premissas e cenários; margem é estimativa, não lucro contábil garantido. Distinguir markup e margem.

Estoque: produto, unidade de medida, conversões explícitas, lote, validade, fornecedor, entrada, saída, perda, ajuste, inventário, transferência e reserva. Procedimento concluído pode consumir ficha técnica uma única vez. Cancelamento/estorno não recoloca material usado em estoque automaticamente. Prevenir quantidade negativa por regra configurável. Produtos fracionados com precisão e rastreio.

Compras: solicitação, aprovação, pedido, recebimento parcial e conta a pagar; consumo e compras refletidos em relatórios. Equipamentos: cadastro, manutenção e indisponibilidade vinculada à agenda.

Documentos financeiros: recibos e demonstrativos imprimíveis com marca da clínica. NFS-e exige provedor e regras reais posteriores; emissão demonstrativa marcada como sem validade fiscal. Não inventar integração municipal universal ou consulta de crédito ativa.

## 14. Integrações e pagamentos: dois contextos separados

Contexto A: clínica paga assinatura à Qlinic. Contexto B: paciente/tutor paga serviços à clínica. Contas, credenciais, ledger, webhooks, relatórios e permissões separados. Dinheiro clínico não deve entrar na conta da plataforma por padrão.

Provedores obrigatórios na arquitetura e nas telas: InfinitePay, Asaas, Mercado Pago, Resend e Evolution API. Acrescentar interfaces desacopladas para assinatura, IA, teleatendimento, prescrição e emissão fiscal. Não adicionar provedores ativos sem configuração.

PaymentProvider deve expor capabilities explícitas: checkout, Pix, boleto, cartão, recorrência, parcelamento, estorno e split. Capacidades não verificadas ficam “depende de homologação”, nunca habilitadas por suposição.

- InfinitePay: preparar checkout/link, acompanhamento e conciliação conforme documentação vigente; não presumir split, subconta, boleto ou assinatura recorrente pela existência de checkout.
- Asaas: preparar cobrança e split conforme documentação e elegibilidade da conta; regra de base líquida e arredondamento conforme provedor.
- Mercado Pago: preparar checkout e conexão de conta; split/marketplace conforme modalidade efetivamente autorizada. Não generalizar uma modalidade 1:1 para repasses arbitrários 1:N.
- Pix manual: opcional, instruções/QR demonstrativo, comprovante e aprovação humana com histórico; não confundir com confirmação bancária automática.

Tela de integração: desconectada, configurando, conectada, degradada, expirada, erro e simulada; último evento, ambiente, capacidades, logs sanitizados, permissões, teste e desconexão. No frontend, teste apenas simulado. Nunca aceitar credenciais reais num formulário que só salva localStorage. Usar placeholders e indicar configuração futura no servidor.

Backend futuro: verificar assinatura/autenticidade de webhook conforme provedor, deduplicar eventId, idempotência de criação, conciliação, eventos fora de ordem, retry e fila de falhas. Redirect de checkout não é prova de pagamento. Retentativa não cria nova cobrança sem controle. Não trocar silenciosamente de gateway após timeout ambíguo. Guardar providerPaymentId, tenant, unidade, conta recebedora e referência de origem.

Qlinic Pay é nome de interface de pagamentos, não alegação de fintech licenciada ou serviço financeiro próprio. Taxa da plataforma somente após validação técnica/comercial e informação transparente.

## 15. Resend, Evolution e notificações

Resend: templates transacionais com marca, prévia, versão e logs de envio. Remetente padrão num domínio/subdomínio verificado da plataforma; domínio do cliente opcional com verificação DNS. Nome exibido pode ser da clínica e Reply-To pode apontar ao contato dela, sem falsificar From de domínio não verificado. Tela de SPF/DKIM/DMARC com estados demonstrativos e registros reais somente retornados pelo provedor. Não inventar valores DNS.

Separar comunicações transacionais e marketing; opt-out apropriado, preferências, bounce, complaint e suppression. Links para portal em vez de prontuários em anexos de email por padrão. Segredos de API exclusivamente no servidor futuro.

Evolution API: integração já faz parte do ecossistema do proprietário, mas não assumir URL/versão/credenciais disponíveis. Criar adapter configurável por tenant e documentar identificação da instância. QR de conexão demonstrativo, status, reconexão, mensagens, mídia, histórico, resposta e handoff. Diferenciar transporte/modo utilizado e não prometer status de API oficial Meta para qualquer instalação Evolution.

Fila de comunicação: canais WhatsApp/email/push, preferências, horário permitido, deduplicação por evento/recipient/canal, tentativas, falha definitiva e fallback configurável. Status enviado, entregue e lido só quando houver evidência correspondente; aceitação pelo provedor não prova leitura.

Eventos mínimos configuráveis: convite, recuperação de acesso, consulta solicitada, confirmação, lembrete, reagendamento, cancelamento, vaga ofertada, check-in, documento disponível, proposta disponível, aceite, cobrança próxima, atraso, pagamento confirmado, retorno, vacina, sessão, estoque baixo, integração com falha e assinatura SaaS vencendo. Cada evento tem destinatário, escopo, canais e template.

Central de preferências no portal e na equipe. Push na tela bloqueada sem diagnóstico, nome de procedimento sensível ou dados clínicos. Link profundo deve exigir sessão adequada e abrir o tenant correto.

## 16. IA e automações

Frontend de recepcionista virtual, ditado/transcrição, resumo, busca administrativa e automações. Provedor substituível. Nesta fase, respostas determinísticas de fixtures com selo de simulação, sem fingir modelo conectado.

Agente administrativo pode consultar disponibilidade e preparar agendamento, com regras de confirmação, duração e dados necessários. Sinais de urgência devem encaminhar ao humano/protocolo aprovado; não responder a relato clínico preocupante apenas oferecendo vaga. Não diagnosticar, prescrever ou prometer disponibilidade antes de confirmar reserva.

Gravação: autorização adequada, aviso visível, iniciar/pausar/encerrar, origem, retenção configurável e possibilidade de excluir áudio segundo política. Não gravar silenciosamente. Transcrição → rascunho → revisão profissional → finalização. Exibir fonte e alterações. Não inventar dados ausentes nem promover sugestão de código/procedimento a fato clínico.

Construtor de automações com gatilho, condições, ação, espera, limites e simulação. Templates: consulta cancelada → oferta à lista de espera; proposta pendente → tarefa de contato; material próximo do vencimento → alerta; retorno definido pelo profissional → lembrete. Não codificar periodicidade clínica universal.

IA futura deve respeitar permissões no servidor, ferramentas allowlisted, limites por tenant, logs minimizados, defesa contra instruções maliciosas em anexos/mensagens e revisão de ações relevantes. Sem acesso irrestrito ao banco nem uso de dados para treinamento por padrão.

## 17. Portal/PWA do paciente e tutor

Página inicial com próxima consulta, ações pendentes, documentos liberados e pagamentos. Agendar, confirmar, reagendar/cancelar conforme política, preencher formulário, acompanhar proposta, pagar em simulação, baixar recibo e solicitar atendimento.

Tutor escolhe o animal; responsável escolhe dependente autorizado. Separar permissões financeiras e clínicas. Portal não exibe automaticamente todas as notas internas ou prontuário completo.

Linha do tempo de tratamento, orientações, sessões, exercícios/nutrição quando liberados, vacinação veterinária, notificações e preferências. Perfil, canais, sessões/dispositivos e solicitação de exportação. Documentos de exemplo com marca d'água de demonstração quando parecerem clínicos/fiscais.

Autenticação e autorização reais são posteriores. Não usar CPF isolado, data de nascimento ou token previsível como mecanismo de autenticação de produção.

## 18. PWA individual por contratante

Obrigatório frontend PWA real e testável, não apenas botão “instalar”. HTTPS no deploy, manifest válido por tenant, nome/short_name, id estável, start_url, scope, display standalone, theme_color, background_color, icons 192/512, maskable com área segura e apple-touch-icon. Usar URLs persistentes de ícones/manifestos, não blob URLs transitórias.

Decisão recomendada: app de paciente e app de equipe com identidades/scopes distintos quando ambos forem instaláveis. Exemplos futuros: clinica.dominio-da-plataforma/portal/ e /equipe/. Definir ids estáveis que não mudem ao alterar logo. Na demonstração por paths, gerar manifestos/ícones por clínica seed em build ou servi-los por mecanismo compatível com a stack. Não criar manifesto de um tenant que inicia em outro.

Upload personalizado na demo deve atualizar a prévia local; se não houver backend para publicar ícones dinâmicos, declarar essa limitação e demonstrar instalação real com identidades das clínicas seed. Não alegar publicação dinâmica persistente com um object URL.

Service worker com escopo correto e estratégia documentada. Cache de shell/assets públicos versionados. Excluir autenticação, endpoints clínicos, financeiros, tokens, arquivos privados e respostas sensíveis do cache automático. Namespaces por tenant/contexto; limpeza ao logout/troca de contexto e atualização.

Offline inicial: shell, informação de indisponibilidade e instrução de reconexão. Não confirmar horário, pagamento ou assinatura offline. Dados clínicos offline reais são fase futura com projeto próprio. Detectar falha real de rede além de navigator.onLine.

Atualização disponível com aviso seguro, sem recarregar formulário com rascunho sem alertar. Limpeza de caches obsoletos. Deep links e recarregamento direto funcionais na Vercel.

Instalação: botão quando API suportada; instruções adaptadas no iOS; estado já instalado; navegação normal como fallback. Não prometer instalação universal, execução permanente em segundo plano ou atualização instantânea de nome/ícone instalado.

Push: preparar permissão mediante ação do usuário, estados suportado/negado/pendente, assinatura por dispositivo/tenant/usuário e remoção. Entrega push real exige backend futuro. Não apresentar timer local como teste de push remoto. Browser instalado e sistema podem limitar entrega.

Testar duas clínicas instaladas/abertas, cores/ícones, deep links, logout, offline, atualização e troca de tenant. Subdomínio separa origens, mas RLS/autorização ainda são necessários no servidor.

## 19. Domínios, Cloudflare e Vercel

Preparar guia de domínio raiz comercial, subdomínios por tenant e domínio próprio opcional. Não considerar qlinic.com.br adquirido. Exibir nomes como exemplos.

Documentar validação de propriedade, mapeamento hostname→tenant, TLS, redirecionamentos, origens confiáveis, cookies e recuperação de domínio removido. Tenant desconhecido deve retornar erro seguro, nunca a clínica padrão.

Cloudflare futuro para DNS/proteções conforme configuração validada; Vercel para hosting. Não aplicar “cache everything” a conteúdo autenticado, HTML privado, manifestos indevidamente compartilhados ou APIs. Verificar suporte e requisitos atuais de wildcard/custom domains/certificados antes de definir registros. Nunca inventar CNAME/TXT universais.

Sessões preferencialmente host-only; não compartilhar cookie amplo entre todas as clínicas sem desenho explícito. Links enviados usam o domínio canônico validado do tenant.

## 20. Assinaturas, privacidade e segurança de produto

Rubrica desenhada, IP e hash isolados não constituem garantia geral de validade nem equivalem a certificado ICP-Brasil. Implementar fluxo visual de assinatura simples e adapter de provedor; documentos que exigem assinatura específica ficam condicionados à integração e validação normativa.

Documento: template versionado, signatários, sequência, autenticação, consentimento, expiração, recusa, trilha e cópia final. Não coletar selfie/geolocalização por padrão; qualquer coleta deve ter necessidade e finalidade explícitas. Não fabricar carimbo de tempo certificado ou certificado digital.

Requisitos futuros: validação LGPD/regulatória por especialidade, minimização, retenção por categoria, controle de acesso, auditoria, backups testados, incidentes, exportação e revisão de contratos. Não prometer “100% LGPD” porque existem checkbox e RLS. Não apagar registro clínico automaticamente a pedido sem avaliar obrigações de retenção.

Frontend: sem segredos, dados reais ou analytics capturando conteúdo clínico. Error reporting futuro sanitizado. Imports/uploads tratados como não confiáveis. Proteção contra CSV formula injection em exportação. Não usar HTML arbitrário de usuário sem sanitização.

## 21. Arquitetura e preparação para Supabase

Organizar por domínio: platform, tenancy, identity, scheduling, clinical, specialties, crm, billing-saas, billing-clinic, inventory, communication, portal, branding, pwa, help.

Contratos tipados: TenantRepository, PatientRepository, AppointmentRepository, ClinicalRecordRepository, BillingRepository, InventoryRepository, DocumentRepository, NotificationProvider, PaymentProvider e IdentityService. Implementações mock separadas; componentes dependem dos contratos.

Persistência local somente para dados fictícios: IndexedDB ou mecanismo adequado, com namespace tenant/user, schema versionado, reset de demo e migração. Não vender isolamento de localStorage como segurança. Dados clínicos reais nunca entram no protótipo público.

Modelo futuro com entidades relacionais: organizations, units, profiles, memberships, roles, permissions, patients, guardians, animals, professionals, resources, services, appointments, encounters, clinical_records, forms, form_versions, treatments, treatment_items, proposals, charges, payments, refunds, commission_rules, ledger_entries, products, lots, stock_movements, documents, signatures, integration_accounts, webhook_events, notifications, audit_events e subscriptions_saas. Evitar tabela universal gigantesca.

JSONB para conteúdo flexível versionado, preservando campos relacionais necessários a autorização, integridade, busca e relatórios. Separar views públicas de tabelas privadas.

Backend posterior Supabase Auth/Postgres/Storage/RLS/Functions conforme necessidade. RLS explícita para leitura/inserção/atualização/exclusão, tenant/unit/membership e vínculo clínico. Testes com identidades de tenants diferentes. RLS não se impõe a service_role; essa chave nunca vai ao navegador. Validar rotas privilegiadas, funções security definer, joins, realtime e storage separadamente. FKs compostas/constraints devem evitar associações entre tenants.

Storage privado com autorização e URLs de duração limitada; marca pública em bucket separado. Job/queue futuro persistente para notificações, retries e reconciliação. Vercel não deve ser tratada como daemon permanente; escolher execução durável posteriormente. Operações clínicas/financeiras críticas precisam de transações, idempotência e controle de concorrência no servidor.

## 22. Landing, comercialização e migração

Landing premium com proposta clara, seleção de segmento, benefícios demonstráveis, prints reais do frontend construído, explicação do PWA com marca própria, planos editáveis, FAQ, demonstração e contato. Não inventar depoimentos, número de clientes, certificações, economia garantida ou superioridade comprovada.

Mostrar recursos incluídos, limites, consumo e custos externos com transparência. Não prometer IA, armazenamento, WhatsApp ou assinatura ilimitados sem modelo de custo.

Importador CSV/XLSX demonstrativo: upload, mapeamento, prévia, campos obrigatórios, duplicados, erros por linha, confirmação, relatório, lote e desfazer importação fictícia. Templates próprios por entidade. Não alegar migração de concorrente em 10 minutos ou compatibilidade com backups não analisados. Migração real futura exige amostra/exportação autorizada e reconciliação.

## 23. Central de ajuda, tours e treinamento

Ajuda pesquisável por tarefa, perfil e segmento. Artigos com pré-requisitos, passos curtos, prints reais da demo, resultado esperado, erros comuns e links diretos. FAQ contextual, checklist inicial e glossário.

Tours: Super Admin; onboarding da clínica; recepção; agenda; consulta por especialidade; financeiro; estoque; portal/tutor; configuração de marca/PWA. Tours retomáveis, puláveis, reiniciáveis e resistentes a elementos ausentes. Não bloquear trabalho nem apontar para seletor invisível. Respeitar permissão e tamanho de tela.

Gravar preferências demonstrativas por usuário/tenant. Não anunciar vídeos prontos se só houver cards. Se vídeo não for produzido nesta fase, entregar treinamento textual com prints e registrar produção audiovisual como futura, sem botão quebrado.

## 24. Dados de demonstração coerentes

Criar pelo menos sete organizações fictícias: odontológica, médica, veterinária, estética, psicologia, fisioterapia e nutrição; uma delas com múltiplas unidades. Cada uma com identidade própria, usuários/perfis, pacientes/tutores, agenda, documentos, propostas e finanças coerentes com seu segmento.

Gerar dados determinísticos relativos a uma data-base configurável para a demonstração não ficar vazia com o tempo. Incluir cenários de atraso, pagamento parcial, cancelamento, estorno, conflito de agenda, assinatura pendente e integração indisponível.

Nenhuma credencial, CPF real, imagem de paciente real ou contato acionável. Acesso demo por seletor, sem alegar login seguro. Banner permanente de demonstração e opção de restaurar dados com confirmação.

## 25. QA: critérios objetivos de conclusão

Executar análise estática, typecheck, lint e build. Testes unitários para dinheiro/parcelamento/repasse, conflitos de agenda, estoque, transições e permissões demonstrativas. Testes de integração/E2E com navegador para fluxos críticos; não testes que só verificam existência de título.

Matriz de cenários obrigatórios:
1. Criar clínica fictícia, escolher segmento, configurar marca e verificar prévias/isolamento.
2. Criar unidade/equipe/serviço e agendar com recurso; impedir conflito.
3. Paciente agenda no público; consulta aparece na recepção do mesmo tenant.
4. Check-in → atendimento → registro → finalização → orientação no portal.
5. Odontograma → plano → orçamento → aceite parcial → cobrança coerente.
6. Tutor com dois animais; vacina de um não aparece no outro.
7. Internação: tarefa prescrita versus administrada e alta.
8. Recepção não vê notas de psicologia; portal só vê documento liberado.
9. Financeiro: parcial, quitação, estorno e repasse sem duplicidade.
10. Estoque: consumo por procedimento, lote, validade e cancelamento sem reposição indevida.
11. Integração simulada falha/timeout/webhook duplicado; sem falso pagamento.
12. Super Admin altera plano/teste; recursos e limites atualizam de forma explicável.
13. Troca tenant A→B→A; sem mistura de cache, marca, lista ou draft.
14. Usuário multiunidade só vê escopos permitidos na demo.
15. Importação inválida/duplicada; relatório e recuperação.
16. PWA: manifesto/ícone/start_url corretos para pelo menos duas clínicas.
17. Recarregar deep link, abrir offline, instalar onde suportado, atualizar e sair.
18. Navegação por teclado, foco de modal, erros de formulário e contraste.
19. Portal móvel: agendar, preencher, aceitar proposta e simular pagamento.
20. Links de ajuda/tour correspondem a elementos reais.

Viewports mínimos: 360, 390, 768, 1024 e 1440 px; testar retrato/paisagem e zoom. Chromium/Firefox/WebKit quando disponíveis. Emulação de WebKit não equivale a teste físico de instalação iOS; registrar como pendente se não houver aparelho.

Capturar screenshots locais dos fluxos e revisar visualmente: sem corte, sobreposição, textos minúsculos, overflow global ou contraste insuficiente. Corrigir problemas, não só listar.

Performance: lazy loading por módulo, charts/mapas fora do bundle inicial, paginação/virtualização quando apropriado, imagens otimizadas. Medir em build de produção, registrar ambiente e resultados; objetivo Lighthouse de acessibilidade >=95 e performance >=90 nas rotas públicas e portal representativas, sem mascarar limitações de medição nem declarar score não executado.

Registrar QA com caso, resultado, evidência, ambiente e pendência. Ausência de console errors inesperados e requests quebradas. Não declarar segurança multi-tenant de produção validada por testes de filtro frontend.

## 26. Entregáveis e encerramento

Entregar código executável e:
- README.md: instalação, scripts, demo, limitações e operação.
- docs/ESCOPO_E_STATUS.md: rastreabilidade de TODOS os módulos.
- docs/ARQUITETURA.md: domínios, tenancy, repositórios e futuras integrações.
- docs/DESIGN_SYSTEM.md: tokens, componentes, marca e acessibilidade.
- docs/PERMISSOES.md: matriz de acesso.
- docs/PWA_WHITE_LABEL.md: arquitetura, manifesto, scopes, cache e testes.
- docs/INTEGRACOES.md: capacidades, contextos financeiros, erros e contratos.
- docs/BACKEND_SUPABASE.md: entidades, políticas futuras, transações e validações.
- docs/DEPLOY_GITHUB_VERCEL_CLOUDFLARE.md: build, rewrites, preview, DNS futuro e rollback.
- docs/QA_REPORT.md: testes executados, evidências e limitações reais.
- docs/PROXIMA_ETAPA_BACKEND.md: backlog ordenado com critérios de aceite.
- .env.example: somente placeholders e distinção público/servidor.

Etapas internas sugeridas: base e design; Super Admin e tenancy; onboarding/marca; agenda/cadastro; prontuários/especialidades; CRM/financeiro/estoque; portais/integrações; PWA/ajuda/landing; QA/deploy. Continuar até concluir o frontend inteiro. Se houver limite de sessão, atualizar checklist e instruções de retomada precisas; não marcar tudo como concluído.

Resumo final: o que funciona, como abrir cada ambiente, dados/perfis demo, comandos executados, resultados, URLs reais quando publicadas e pendências externas. Distinguir frontend pronto para demonstração de sistema pronto para operar com pacientes reais.

COMECE AGORA: inspecione o repositório, registre a matriz de escopo, implemente o sistema e valide. Não responda apenas com proposta de como faria.

---

## Referências de verificação para a etapa de integração

Consultar versões vigentes antes de codificar integrações reais. As fontes abaixo fundamentam limitações, não garantem que todas as funções estejam contratadas na conta do cliente.

- Clinicorp, capacidades anunciadas: https://www.clinicorp.com/ e https://www.clinicorp.com/planos
- InfinitePay, integrações: https://www.infinitepay.io/desenvolvedores
- Asaas, split: https://docs.asaas.com/docs/split-de-pagamentos
- Mercado Pago, configuração de split: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Resend, domínios: https://resend.com/docs/dashboard/domains/introduction
- PWA instalável: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Web Push iOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Lei 14.063, texto e links de atualização: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm

Nota sobre benchmarking: alegações de falhas de concorrentes, implantação obrigatória, reclamações, custos específicos, IA apenas passiva e migração universal não foram validadas neste documento. A própria Clinicorp anuncia voz e agentes de WhatsApp. Não usar tais alegações em marketing do Qlinic sem evidência atual e verificável.
