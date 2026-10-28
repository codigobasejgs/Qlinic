# Escopo e status — Qlinic

Estados: **não iniciado** · **frontend implementado** (código pronto, sem verificação no navegador de todas as ações) ·
**frontend validado** (verificado no navegador e/ou por teste automatizado — evidência citada) · **integração futura** (depende de backend/provedor).
“Validado” refere-se ao frontend de demonstração, nunca a operação com pacientes reais. Detalhe por item: `docs/parts/*.md`; evidências: `docs/QA_REPORT.md`.

## Fundação, identidade e ambientes
| Req. | Item | Rota/ambiente | Estado | Evidência | Dependência externa |
|---|---|---|---|---|---|
| 0 | SVGs oficiais preservados, `QlinicLogo` tipado (horizontal/vertical/símbolo, tons, proporção) | todos | frontend validado | Prints revisados; vitrine | registro de marca |
| 0 | Vitrine de identidade (logos, tokens, contraste ao vivo, componentes) | `/demonstracao/identidade` | frontend validado | public-help.md, prints 360–1440 | — |
| 0 | Manifesto exemplo da marca-mãe não ativado para tenants | — | frontend validado | E2E manifestos por tenant | — |
| 2 | Inspeção, preservação de `public/brand`, `design-system`, `docs` | repositório | frontend validado | arquivos intactos | — |
| 3 | pt-BR, BRL em centavos, fuso por unidade, data civil × instante | todos | frontend validado | Unit `lib/foundation.test.ts` | — |
| 3 | Ações com efeito observável + erro tratado; selo de simulação | todos | frontend validado | fluxos dos módulos | — |
| 4 | Tokens semânticos light/dark completos, white-label com contraste derivado | todos | frontend validado | Unit contraste (cores claras/escuras, texto sobre fundo suave) | — |
| 4 | Componentes mínimos (botões, campos/máscaras, combobox, data, filtros, abas, tabela/lista, drawer, diálogo, alerta, timeline, calendário, upload, comparador, assinatura, editor, skeleton, empty/error, breadcrumbs, paginação, command palette, notificações) | `src/ui` | frontend validado | uso nos módulos; E2E foco/Esc | — |
| 4 | Layout desktop/tablet/celular sem rolagem horizontal | todos | frontend validado | E2E 360/390/768/1024/1440 | — |
| 4 | WCAG 2.2 AA (objetivo) | todos | frontend validado (parcial) | Lighthouse a11y 100 em 8 rotas; teclado E2E | leitor de tela real não testado |
| 5 | Org → unidades → memberships; pessoa/paciente/tutor/responsáveis separados | todos | frontend validado | Unit tenancy; E2E 13/14 | auth/RLS |
| 5 | Matriz de permissões + “visualizar como” | `/app/:slug/permissoes` | frontend implementado | settings.md (abre; filtros não testados) | autorização no servidor |
| 5 | Feature flag × limite do plano × permissão | settings, master | frontend validado | Fluxo platform (downgrade), Unit | — |
| 5 | Limpeza ao trocar tenant | todos | frontend validado | E2E A→B→A | — |
| 6 | Rotas públicas, demo, auth, master, app, c/*, totem, painel, proposta | todas | frontend validado | E2E deep link; prints | — |
| 6 | TenantResolver + tenant desconhecido seguro | gates | frontend validado | E2E | hostname verificado |

## Super Admin (7)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Dashboard MRR/ARR/churn/conversão/inadimplência/uso/falhas com definição e período | `/master` | frontend validado | Unit metrics; prints 3 papéis | dados reais |
| Contratantes, unidades, responsáveis, filtros, suspensão sem apagar dados | `/master/contratantes` | frontend validado | Fluxo platform | backend |
| Planos (ciclos, limites, módulos, excedentes, upgrade/downgrade) | `/master/planos` | frontend validado | Fluxo platform | decisão comercial |
| Testes (duração, extensão com motivo, expiração, conversão) | `/master/testes` | frontend validado | Fluxo platform | — |
| Assinaturas (cupons, descontos, pausa, cancelamento, histórico) | `/master/assinaturas` | frontend validado | Fluxo platform | billing real |
| Cobrança SaaS e conciliação (contexto A) | `/master/cobranca` | frontend validado | Fluxo platform | gateway da plataforma |
| Saúde de integrações, filas, erros sanitizados, dedupe | `/master/integracoes` | frontend validado | Fluxo platform | provedores |
| Domínios e PWA por cliente | `/master/dominios` | frontend validado | Fluxo platform | DNS/TLS reais |
| Suporte, SLA, acesso assistido com autorização/expiração/revogação | `/master/suporte` | frontend validado | Fluxo platform | grants no servidor |
| Operação (flags, incidentes, avisos, changelog, status) | `/master/operacao` | frontend validado | Fluxo platform | — |
| Governança (usuários internos, auditoria, exportação/encerramento) | `/master/governanca` | frontend validado | Fluxo platform | — |
| Custos por tenant e margem SaaS | `/master/custos` | frontend validado | Unit margem | custos reais |

## Onboarding e configurações (8)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Wizard 10 etapas com salvamento e retomada | `/app/:slug/onboarding` | frontend validado | Fluxo settings | backend |
| Organização, unidades/horários/feriados/recursos, serviços, equipe | `/app/:slug/configuracoes` | frontend implementado | settings.md | backend |
| Políticas rede → unidade com herança e restaurar padrão | `/app/:slug/configuracoes` | frontend validado | Fluxo settings (u2 12 h → 24 h), Unit | — |
| Logo/símbolo: tipo/tamanho, SVG rejeitado, recorte, prévia dark/ícone, iniciais | `/app/:slug/marca` | frontend validado | Fluxo settings | storage + publicação de ícones |

## Agenda, recepção e chegada (9)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Dia/semana/mês/lista; filtros profissional/recurso/unidade/procedimento | `/app/:slug/agenda` | frontend validado | prints; E2E responsivo | — |
| Criar/editar/cancelar/reagendar com motivo; conflitos; recorrência | agenda | frontend validado | Fluxo scheduling; Unit | transação no servidor |
| Arrastar para mover / editar “esta e seguintes” | agenda | frontend implementado | scheduling.md | — |
| Status com transições válidas e histórico; status financeiro separado | agenda | frontend validado | Unit transições | — |
| Lista de espera, oferta temporária, disputa de vaga | `/app/:slug/lista-espera` | frontend validado | Fluxo scheduling (2º aceite recusado) | reserva atômica |
| Recepção: fila, tempos, chamada, caixa, recebimento | `/app/:slug/recepcao` | frontend validado | Fluxo scheduling/comercial | — |
| Busca rápida, cadastro progressivo, duplicidade, documentos pendentes | recepção | frontend implementado | scheduling.md | — |
| Totem com token de curta duração, sem dados de terceiros, reinício | `/c/:slug/totem` | frontend validado | Fluxo + Unit (QR decodificado) | token no servidor |
| Painel de chamada com privacidade | `/c/:slug/painel` | frontend validado | Fluxo (entre abas) | realtime autorizado |

## Cadastro e prontuário (10)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Paciente, responsáveis, convênio, preferências, duplicidade com revisão | `/app/:slug/pacientes` | frontend validado | Fluxo clinical | — |
| Prontuário estruturado, rascunho → finalizado, adendo | `/app/:slug/atendimento/:id` | frontend validado | Fluxo clinical 26/26; Unit | imutabilidade no banco |
| Modo consulta, alerta de não salvo, gravação consentida → transcrição como rascunho | atendimento | frontend validado | Fluxo clinical | provedor de transcrição |
| Construtor de formulários versionado | `/app/:slug/formularios` | frontend validado | Fluxo clinical (v3 sem alterar v2) | — |
| Documentos com template, impressão com marca d’água, assinatura demonstrativa | `/app/:slug/documentos` | frontend validado | Fluxo clinical | ICP-Brasil / provedor |
| Arquivos: galeria, upload, falha, versões | ficha do paciente | frontend implementado | clinical.md | storage privado, DICOM |

## Especialidades (11)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Odontograma 2D (permanente/decídua/mista, faces, teclado, mobile) → plano → orçamento | `/app/:slug/odontologia` | frontend validado | Fluxo dental; Unit FDI | — |
| Periodontograma, ortodontia, alinhadores, laboratório, imagens, esterilização | odontologia | frontend implementado | Unit (perio, laboratório); prints | dispositivos |
| SOAP, sinais vitais, retorno | `/app/:slug/medicina` | frontend validado | Fluxo dental (IMC, SpO₂ recusado) | — |
| Exames, encaminhamentos, receitas/atestados (rascunho), pediatria sem percentis | medicina | frontend implementado | prints | referências clínicas validadas |
| Convênios: elegibilidade simulada, artefato TISS não homologado | `/app/:slug/convenios` | frontend validado | Fluxo dental | TISS/TUSS versionado |
| Guias, lotes, glosa, recurso, conciliação | convênios | frontend implementado | prints | operadoras |
| Veterinária: tutor → animais, vacinas por animal, peso, calculadora | `/app/:slug/veterinaria` | frontend validado | E2E 6; Unit calculadora | — |
| Internação (administração validada; alta não percorrida), banho/tosa | veterinária | frontend implementado | Fluxo parcial | — |
| Estética: mapa, pacotes, comparador, consentimento por finalidade | `/app/:slug/estetica` | frontend validado | Fluxo (divulgação bloqueada) | — |
| Psicologia: séries, registros restritos, menores | `/app/:slug/psicologia` | frontend validado | E2E 8; Unit | RLS |
| Fisioterapia, nutrição, plano multidisciplinar | rotas próprias | frontend implementado | prints; especialidades.md | revisão profissional |

## Comercial, financeiro e estoque (12–13)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| CRM Kanban configurável, perda com motivo, alternativa ao arrastar | `/app/:slug/crm` | frontend validado | Fluxo comercial | — |
| Orçamento/versões/alternativas/descontos; aceite parcial idempotente | `/app/:slug/orcamentos` | frontend validado | Fluxo + Unit | — |
| Link de proposta com aceite, recusa, assinatura e pagamento simulados | `/c/:slug/proposta/:token` | frontend validado | Fluxo portal | autenticação de link |
| Receber/pagar, caixa, Pix manual com aprovação, estorno, acordos | `/app/:slug/financeiro` | frontend validado | Fluxo comercial; Unit | ledger transacional |
| Comissões versionadas com snapshot (≠ split bancário) | `/app/:slug/comissoes` | frontend validado | Fluxo (83 itens); Unit | — |
| Simulador de precificação (markup × margem) | `/app/:slug/precificacao` | frontend validado | Unit | — |
| Estoque: conversões, lotes/validade, FEFO, inventário, transferência, consumo único | `/app/:slug/estoque` | frontend validado | Unit; efeito | transações no servidor |
| Compras e equipamentos (bloqueio de agenda) | `/app/:slug/compras` | frontend validado | Fluxo comercial | — |
| Recibos/demonstrativos; NFS-e demonstrativa sem validade | financeiro | frontend implementado | comercial.md | provedor fiscal |

## Integrações, comunicação, IA (14–16)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Contextos A/B separados; capacidades “depende de homologação” | master + comunicação | frontend validado | engagement.md, platform.md | homologação |
| Cenários falha/timeout/webhook duplicado sem falso pagamento | pagamentos | frontend validado | Unit; Fluxo portal | webhook assinado |
| Resend: From verificado, SPF/DKIM/DMARC sem valores inventados, suppression | `/app/:slug/comunicacao` | frontend validado | Fluxo engagement | domínio real |
| Evolution: QR demo, conversas, handoff | comunicação | frontend validado | Fluxo engagement (Lumière) | instância real |
| Fila: dedupe, preferências, horário silencioso, aceito ≠ entregue ≠ lido | comunicação + fundação | frontend validado | Unit; gate aplicado a todo envio | fila durável |
| Templates dos 21 eventos | comunicação | frontend implementado | engagement.md | — |
| Recepcionista virtual (disponibilidade real, confirmação humana, urgência, injection) | `/app/:slug/ia` | frontend validado | Fluxo + Unit | provedor de IA |
| Automações com limites e simulação | `/app/:slug/automacoes` | frontend validado | Fluxo + Unit | agendador no servidor |

## Portal, PWA, domínios (17–19)
| Item | Rota | Estado | Evidência | Dependência |
|---|---|---|---|---|
| Portal: início, agendar, consultas, documentos liberados, pagamentos, formulários, propostas, tratamento, vacinas, preferências, perfil | `/c/:slug/portal/*` | frontend validado | Fluxo portal 390 px; E2E 6/8 | auth do paciente |
| Página pública e agendamento sem login | `/c/:slug`, `/c/:slug/agendar` | frontend validado | E2E 3 | — |
| Manifesto/ícones por clínica (equipe e portal, ids estáveis) | `/t/:slug/*` | frontend validado | E2E 16 | HTTPS em deploy |
| SW: shell, offline, exclusões sensíveis, atualização segura, limpeza por tenant | `public/sw.js` | frontend validado (parcial) | E2E offline; atualização não automatizada | iOS físico |
| Instalação (prompt/iOS/instalado/fallback), push preparado | equipe/portal | frontend implementado | código + docs | VAPID/backend |
| Guia de domínios, Cloudflare, Vercel | docs | integração futura | `DEPLOY_GITHUB_VERCEL_CLOUDFLARE.md` | destino e autorização |

## Segurança de produto, arquitetura, comercialização, ajuda, dados (20–24)
| Item | Estado | Evidência | Dependência |
|---|---|---|---|
| Assinatura demonstrativa ≠ ICP-Brasil; sem selfie/geo; CSV seguro; sem HTML arbitrário | frontend validado | Unit CSV; lint | validação jurídica |
| Domínios de código, contratos de repositório, mocks separados, eventos | frontend validado | `ARQUITETURA.md` | Supabase |
| Modelo relacional, RLS, storage, filas | integração futura | `BACKEND_SUPABASE.md` | autorização |
| Landing, segmentos, planos, recursos sem alegações indevidas | frontend validado | prints; Lighthouse | — |
| Importador CSV com mapeamento, erros, duplicados, lote e desfazer (XLSX: pede CSV) | frontend validado | Fluxo settings | migração real |
| Central de ajuda, artigos com prints reais, checklist, glossário, 15 tours | frontend validado | Unit rotas; prints | vídeos (futuro) |
| 7 clínicas fictícias determinísticas, multiunidade, cenários, reset | frontend validado | smoke seed; Unit | — |

## QA (25) e entregáveis (26)
| Item | Estado | Evidência |
|---|---|---|
| Typecheck, lint, 241 unitários, 22 E2E, build | frontend validado | `QA_REPORT.md` §1 |
| Viewports 360–1440 sem overflow | frontend validado | E2E responsivo |
| Lighthouse a11y ≥ 95 | atingido (100 em 8 rotas) | §4 |
| Lighthouse performance ≥ 90 | **não atingido** em landing (70) e agendamento público (87) | §4, com próximos passos |
| Firefox/WebKit/iOS/Android físicos | não testado | §6 |
| Documentação e `.env.example` | entregue | `docs/` |

## Retomada
1. Pré-render da landing e disponibilidade sob demanda no agendamento público (performance ≥ 90).
2. Testes em Firefox/WebKit e aparelhos físicos (instalação PWA iOS/Android).
3. Percorrer no navegador os itens “frontend implementado” acima.
4. Etapa de backend (`PROXIMA_ETAPA_BACKEND.md`), somente com autorização.

## Contratação SaaS (complemento v1.0 — 28/10/2026)
| Req. | Item | Rota/ambiente | Estado | Evidência | Dependência externa |
|---|---|---|---|---|---|
| C1 | Contrato dentro da escolha do plano (formulário + contrato ao vivo, 4 blocos); `/contrato` e `/contratar` redirecionam | `/planos?plano=&ciclo=#contratacao` | frontend validado | E2E `contracts.spec.ts` (12), `qa/connected-plans-e2e.mjs` (18, Supabase real) | revisão jurídica |
| C2 | Ambiente real: solicitação de contratação (RPC `request_saas_contract`, preço do servidor, idempotente, nunca “assinado”) | `/planos` | integração parcial validada | RLS 56/56, E2E conectado | provedor de assinatura, gateway |
| C3 | Estados independentes contrato/pagamento/SaaS; idempotência; ativação só por eventos | — | frontend validado | unit (16) | backend |
| C4 | Meu plano e contrato (cópia final, aditivos, faturas, cancelamento com protocolo, exportação) | `/app/:slug/meu-plano` | frontend validado | E2E | — |
| C5 | Contratos SaaS e Contratação (contratada, quadro comercial, modelos versionados) | `/master/contratos`, `/master/contratacao` | frontend validado | E2E (suporte sem edição; publicação exige revisões) | aprovação comercial/jurídica |
| C6 | Modelo Supabase, RLS e Edge Functions da contratação | — | integração futura | `docs/contratacao/MODELO_SUPABASE.md` | Supabase + provedores |
Detalhes: `docs/contratacao/QA_CONTRATO_NOS_PLANOS.md` (atual), `QA_CONTRATACAO.md` (histórico) e `PENDENCIAS.md`.
