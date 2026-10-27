# QA Report — Qlinic (frontend de demonstração)

Data: 27/10/2026 · Ambiente: Windows 10 Pro 19044, Node 22.17.1, npm 10.9.2, Chromium do Playwright 1.64.1 (headless).
Build medido: `npm run build` (Vite 8.3.5). Servidor de medição: `vite preview` e `qa/serve-gzip.mjs` (estático + gzip + fallback SPA,
aproxima a Vercel). **Nada aqui é teste de segurança multi-tenant de produção**: filtros no frontend não provam isolamento.

## 1. Análise estática e testes automatizados
| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck (strict) | `npm run typecheck` | 0 erros |
| Lint (ESLint 10 + typescript-eslint + react-hooks; bloqueio de `dangerouslySetInnerHTML`) | `npm run lint` | 0 erros, 0 avisos |
| Unitários (Vitest) | `npm test` | **241 testes / 16 arquivos — todos passaram** |
| E2E (Playwright, contra build) | `npm run e2e -- --project=chromium-desktop` | **22 testes — todos passaram** |
| Build de produção | `npm run build` | ok; chunk inicial do site 66 KB + react 68 KB + router 30 KB (gzip) |

Cobertura unitária relevante (arquivos `*.test.ts`): dinheiro/parcelamento/rateio/markup×margem; fusos e datas civis; contraste e derivação de
marca (inclui texto sobre fundo suave para qualquer cor de cliente); CSV com formula injection; permissões (unidade, escopo próprio, restrito);
isolamento por tenant no store; tutor com 2 animais; aceite parcial sem cobrança duplicada; parcial/quitação/estorno sem apagar movimento;
idempotência por `providerPaymentId`; conflitos de agenda e transições; check-in com token de uso único e senha pelo dia civil da unidade;
finalização/adendo de prontuário; dedupe/opt-out da fila; QR real (decodificado com OpenCV); comissões (versão de regra, sem dupla contagem);
estoque (conversão, FEFO, negativo bloqueado, consumo único); simulador de preços; periodontograma/FDI/IMC/laboratório; calculadora veterinária
(unidade incompatível, dado ausente); urgência e prompt injection da IA; limites de automação; From não verificado; herança de políticas;
importador; métricas SaaS (MRR normalizado, ARR, churn, conversão, inadimplência, margem); rotas de ajuda/tours apontam para rotas reais.

## 2. Matriz de cenários obrigatórios (seção 25)
Legenda de evidência: **E2E** = `e2e/*.spec.ts` (automatizado, rodado nesta data); **Fluxo** = script Playwright do módulo em `qa/tmp/*-flow.mjs`
rodado pelo agente do módulo, com verificações descritas em `docs/parts/*.md`; **Unit** = teste Vitest.

| # | Cenário | Resultado | Evidência | Pendência |
|---|---|---|---|---|
| 1 | Criar clínica, segmento, marca, prévias/isolamento | Passou | Fluxo settings (onboarding retomável, cor #FDE047 → texto navy), Unit contraste | Ícone instalado de clínica nova exige backend |
| 2 | Unidade/equipe/serviço e agendar com recurso; impedir conflito | Passou | Unit `domain/foundation.test.ts` (conflito profissional, encaixe reconhecido), Fluxo scheduling | — |
| 3 | Paciente agenda no público; aparece no mesmo tenant | Passou | **E2E** flows #3 (store do tenant certo, ausente em outro tenant) | — |
| 4 | Check-in → atendimento → registro → finalização → orientação no portal | Passou | Fluxo scheduling (totem A001, reuso recusado), Fluxo clinical (26/26: iniciar, finalizar, orientação liberada) | — |
| 5 | Odontograma → plano → orçamento → aceite parcial → cobrança | Passou | Fluxo dental (marcação por teclado → ORC-0002), Fluxo portal (aceite 3x, aditivo sem duplicar), Unit aceite 2x | — |
| 6 | Tutor com dois animais; vacina isolada | Passou | **E2E** flows #6, Unit isolamento, Fluxo especialidades | — |
| 7 | Internação: prescrito × administrado e alta | Passou parcial | Fluxo especialidades (administração de tarefa), Unit estados de tarefa | Alta não percorrida no navegador |
| 8 | Recepção não vê psicologia; portal só liberado | Passou | **E2E** flows #8, Unit `canSeeRecord` | — |
| 9 | Parcial, quitação, estorno, repasse sem duplicidade | Passou | Unit financeiro/comissões, Fluxo comercial (83 itens de fechamento) | — |
| 10 | Estoque: consumo por procedimento, lote, validade, cancelamento | Passou | Unit estoque (consumo único, FEFO), efeito em `commercial/effects.ts` | — |
| 11 | Integração falha/timeout/webhook duplicado sem falso pagamento | Passou | Unit idempotência, Fluxo portal (cenários falha/timeout/duplicado), Fluxo platform (dedupe) | Webhook real com assinatura = backend |
| 12 | Super Admin altera plano/teste; limites explicáveis | Passou | Fluxo platform (downgrade com diff de módulos, extensão/conversão), **E2E** suporte sem planos/cobrança | — |
| 13 | Troca A→B→A sem mistura | Passou | **E2E** platform-pwa (marca, manifesto, rascunho não lido em B) | — |
| 14 | Multiunidade só vê escopo permitido | Passou | **E2E** flows #14 (gestora Cambuí), Unit `allowedUnitIds` | — |
| 15 | Importação inválida/duplicada; relatório e recuperação | Passou | Fluxo settings (5 linhas: 2 válidas, 2 erros, 1 duplicada, fórmula como texto; desfazer lote) | XLSX não processado (pede CSV) |
| 16 | PWA: manifesto/ícone/start_url por clínica | Passou | **E2E** 3 manifestos + ícones 200, link correto em equipe e portal | — |
| 17 | Deep link, offline, instalar, atualizar, sair | Passou parcial | **E2E** deep link recarregado; offline com SW controlando mostra “sem conexão” | Instalação real e fluxo de atualização não automatizados; iOS físico não testado |
| 18 | Teclado, foco de modal, erros, contraste | Passou | **E2E** foco preso/Esc; Lighthouse a11y 100 nas 8 rotas; Unit contraste | Leitor de tela real não testado |
| 19 | Portal móvel: agendar, preencher, aceitar, pagar | Passou | Fluxo portal em 390 px | — |
| 20 | Links de ajuda/tour correspondem a elementos reais | Passou | Unit `help/routes.test.ts` (artigos, checklist, 15 tours) | — |

## 3. Responsividade
**E2E** `responsivo {360,390,768,1024,1440}px`: landing, demonstração, agenda, odontologia, financeiro, portal e Super Admin sem rolagem horizontal
da página. Problemas encontrados e **corrigidos** nesta rodada: topbar a 360 px (6 px de overflow → seletor de unidade fluido, tema no menu do usuário),
abas da odontologia a 768 px (`min-width: 0` em filhos de pilha), seletor de unidade exibido para usuária com 1 unidade, botão “fechar menu”
visível na sidebar desktop. Além disso, cada agente capturou e revisou suas telas em 1440 e 390 px (469 capturas em `qa/tmp/`, não versionadas).
Retrato/paisagem de tablet e zoom 200 % **não** foram automatizados.

## 4. Lighthouse 12.8.2 (perfil móvel padrão, throttling simulado: 150 ms RTT, ~1,6 Mbps, CPU 4×)
Servidor: `qa/serve-gzip.mjs` sobre `dist/`. Script: `qa/lighthouse.mjs` (resultados brutos em `qa/lighthouse/*.json`).

| Rota | Performance | Acessibilidade | Boas práticas | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` (landing) | **70** | 100 | 100 | 3,8 s | 5,8 s | 0 ms | 0 |
| `/planos` | 100 | 100 | 100 | 0,7 s | 0,7 s | 50 ms | 0 |
| `/demonstracao` | 100 | 100 | 100 | 0,7 s | 0,8 s | 0 ms | 0 |
| `/ajuda` | 100 | 100 | 100 | 0,7 s | 0,7 s | 0 ms | 0 |
| `/c/vet-amigo` | 100 | 100 | 100 | 0,7 s | 0,7 s | 0 ms | 0 |
| `/c/vet-amigo/agendar` | **87** | 100 | 100 | 0,7 s | 0,7 s | 540 ms | 0 |
| `/c/vet-amigo/portal` | 100 | 100 | 100 | 0,7 s | 0,7 s | 0 ms | 0 |
| `/c/vet-amigo/portal/vacinas` | 100 | 100 | 100 | 0,7 s | 0,7 s | 20 ms | 0 |

Rodada única, com aquecimento do servidor antes das auditorias e sessão demo injetada nas rotas de portal. A landing em perfil
totalmente novo (`qa/lighthouse-cold-gzip.mjs`, 3 execuções) dá 68–71. Uma auditoria isolada e fria da página da clínica deu 67;
na rodada com aquecimento, 100. Por isso os números absolutos variam com o estado do servidor local.
Falhas de acessibilidade corrigidas antes desta rodada: contraste de texto de marca sobre fundo suave (4,32 → ≥ 4,5:1, inclusive
white-label), link em alerta, `aria-pressed` em `<span>`, ordem de títulos e nome acessível do logo da clínica.

**Meta não atingida em 2 rotas, registrada sem mascarar:**
- **Landing 70 (meta 90).** LCP é o print real da agenda (WebP 82 KB). O atraso é de renderização: SPA precisa baixar e executar React + router
  (~100 KB gzip) sob CPU 4× antes do conteúdo. Mitigações já aplicadas: seeds e ambientes de clínica fora do bundle público
  (130 → 92 KB gzip no chunk inicial), prints WebP com `srcset` 720 px, chunks agrupados, casca HTML estática do hero (1º paint
  medido em ~1,36 s com CPU 4×, antes do React), remoção do recarregamento duplo do SW na 1ª visita. **Próximo passo:** pré-render (SSG)
  da landing ou print menor/fora da 1ª dobra no celular.
- **Agendamento público 87.** TBT de 540 ms vem do cálculo de disponibilidade (`availableSlots`) no carregamento. **Próximo passo:** calcular
  sob demanda por dia ou em Web Worker; no backend, a disponibilidade virá do servidor.

## 5. Console e rede
Os testes E2E coletam `pageerror`, `console.error` e requisições falhas (helper `collectErrors`): 0 ocorrências nas rotas verificadas.
Agentes de módulo relataram 0 erros de console nas suas capturas.

## 6. Navegadores e dispositivos
| Alvo | Situação |
|---|---|
| Chromium (desktop e emulação Pixel 7) | Testado |
| Firefox | **Não testado** (binário não instalado no ambiente) |
| WebKit | **Não testado** (emulação não substitui iOS real) |
| iOS físico (instalação PWA, push) | **Pendente** — sem aparelho |
| Android físico | **Pendente** |

## 7. Limitações reais
- Dados só no `localStorage` do navegador; isolamento por namespace não é segurança.
- Integrações (pagamento, WhatsApp, e-mail, IA, assinatura, TISS, NFS-e) são simuladas e marcadas como tal.
- Clínicas criadas na demo não têm manifesto/ícones publicados (dependem de backend com HTTPS).
- Varreduras periódicas de automação rodam por botão; sem agendador.
- Detecção de urgência e prompt injection por palavras-chave (falso positivo/negativo possível).
- Arrastar e soltar (agenda e CRM) não percorrido em teste automatizado; alternativas por formulário testadas.
