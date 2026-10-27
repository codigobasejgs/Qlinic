# Módulo engagement — Comunicação, IA (simulada) e Automações

Arquivos: `src/modules/engagement/` — `pages.tsx` (exports `CommunicationPage`, `AiAssistantPage`, `AutomationsPage`), `comm-*.tsx` (abas), `ai.tsx`, `automations.tsx`,
`engine.ts` (casos de uso sobre o store), `rules.ts` (regras puras), `catalog.ts` (eventos/rótulos), `types.ts` (coleções via declaration merging), `seed.ts`, `effects.ts`, `preview.tsx`, `ui.tsx`, `styles.css`.
Testes: `rules.test.ts` (30), `effects.test.ts` (3).

Validação no navegador (Playwright, 1440 e 390 px): org_sorriso (proprietária), org_vitta, org_lumiere. Screenshots em `qa/tmp/eng-*.png`; sem `pageerror`; `scrollWidth` = 390 em todas as telas (sem rolagem horizontal da página).

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Fila/Outbox com 9 status distintos + legenda “aceito ≠ entregue ≠ lido” | /comunicacao?aba=fila | frontend validado | rules.test (fila) | Provedores reais (servidor) |
| Deduplicação evento/destinatário/canal; retentar no mesmo registro/dedupeKey; limite de tentativas → falha definitiva | /comunicacao?aba=fila (drawer) | frontend validado (retentar no navegador) | rules.test | — |
| Fallback configurável (WhatsApp → e-mail), idempotente | fila + Preferências | frontend implementado | — | — |
| Eventos simulados entregue/lido/falha/bounce/complaint, só com evidência anterior; bounce/complaint → suppression | drawer da fila | frontend implementado | rules.test (evidência) | Webhooks do provedor |
| Horário silencioso → `aguardando_janela`; processar fila / liberar agora | fila | frontend implementado | rules.test | Fila durável no servidor |
| 21 eventos da spec + modelo de marketing: destinatário, escopo, canais, template por canal, variáveis, versão/histórico | /comunicacao?aba=templates | frontend validado | — | — |
| Prévia com marca (e-mail em componentes React, WhatsApp, push de tela bloqueada) — sem HTML arbitrário | templates | frontend validado | — | — |
| Bloqueio de termos sensíveis em lembrete/push/e-mail; marketing exige opt-in e texto de opt-out | templates + fila (`suprimido`) | frontend implementado | rules.test (sensitiveTerms) | Classificação revisada no servidor |
| E-mail: remetente da plataforma, nome exibido, Reply-To; From de domínio não verificado bloqueado; injeção de cabeçalho rejeitada | /comunicacao?aba=email | frontend validado (Vitta: domínio pendente bloqueado) | rules.test (validateFrom) | Resend |
| Domínio próprio SPF/DKIM/DMARC em estados demonstrativos, sem valores DNS | email | frontend validado | — | Resend/DNS |
| Logs de envio, suppression list (adicionar/remover com motivo e auditoria), chave de API desabilitada | email | frontend validado | — | — |
| WhatsApp (Evolution): instância por tenant (placeholders), estados, QR demonstrativo, reconectar, inbox, mídia fictícia, responder, handoff com responsável, histórico; aviso Evolution ≠ API oficial Meta | /comunicacao?aba=whatsapp | frontend validado (Lumière: erro → reconexão → simulada) | — | Evolution API |
| Preferências de alertas internos por perfil; horário permitido; tentativas; fallback | /comunicacao?aba=preferencias | frontend implementado | — | — |
| Integrações da clínica (Contexto B): 6 provedores + 5 interfaces desacopladas; estado, ambiente, último evento, capacidades (`PROVIDERS`/`CAP_LABEL`, “depende de homologação”), logs sanitizados, testar (simulado), desconectar; seletor de cenário (`setSimScenario`) | /comunicacao?aba=integracoes | frontend validado | rules.test (sanitizeLog) | Gateways reais |
| IA: SimBadge “respostas determinísticas — nenhum modelo conectado” | /ia | frontend validado | — | Provedor de IA |
| Recepcionista: `availableSlots` real, coleta de paciente/serviço/unidade/preferência, resumo, `createAppointment` (source 'ia') só com confirmação humana | /ia | frontend validado (12 opções → agendamento confirmado) | — | — |
| Urgência por palavras-chave → SAMU 192 / CVV 188 / emergência veterinária + tarefa humana urgente; bloqueia oferta de vaga | /ia | frontend validado | rules.test (detectUrgency) | Protocolo clínico aprovado pela clínica |
| Pergunta clínica → sem diagnóstico/prescrição, encaminha a humano | /ia | frontend implementado | rules.test (isClinicalQuestion) | — |
| Prompt injection em mensagem/anexo tratada como conteúdo, com aviso | /ia, inbox WhatsApp | frontend validado | rules.test (detectInjection) | — |
| Busca administrativa (consultas de amanhã, cobranças vencidas) com fontes, respeitando `t.can`/escopo/unidade; resumo do dia | /ia | frontend validado | — | — |
| Painel de política: ferramentas allowlisted, créditos do plano, logs minimizados (sem conteúdo), sem treinamento | /ia | frontend validado | — | — |
| Construtor gatilho → condições → ação → espera → limites (por pessoa/dia, janela) | /automacoes | frontend implementado | rules.test (limites/janela) | — |
| Simulação sem efeitos + ativar/desativar + histórico de execuções | /automacoes | frontend validado | effects.test (simulação sem efeito) | — |
| Templates: cancelada → lista de espera; proposta pendente → tarefa CRM; material vencendo → alerta; retorno definido pelo profissional → lembrete (sem periodicidade universal) | /automacoes (seed) | frontend implementado | — | — |
| effects: `appointment.cancelled` → `matchWaitlist`+`offerSlot`; `stock.low` → alerta 'estoque_baixo'; `record.finalized`/`payment.confirmed`/`proposal.accepted`; idempotência por fato | eager | frontend implementado | effects.test | Fila/eventos persistidos no servidor |
| Seeds: templates, 4 automações (2 ativas), conversas, integrações variadas (erro/expirada), suppression, domínio pendente (Vitta) | — | frontend validado | — | — |

## Limitações reais
- Tudo simulado: nenhum envio, nenhuma chamada a Resend/Evolution/gateways; o aceite do provedor é um `setTimeout` local.
- Varredura de automações (proposta pendente, lote vencendo, vacina) e reprocessamento de execuções adiadas rodam só por botão (“Varredura manual” / “Processar fila”); não há agendador.
- Detecção de urgência, injection, pergunta clínica e termos sensíveis usa palavras-chave: falso positivo e falso negativo são possíveis. Não substitui protocolo clínico nem moderação no servidor.
- Retorno definido pelo profissional depende de um campo `retornoEm`/`retorno_em`/`returnOn` (YYYY-MM-DD) no conteúdo do registro; os templates clínicos atuais não têm esse campo, então a automação de retorno não encontra dados no seed (fica “ignorada” com motivo).
- Lote vencendo depende da coleção `lots` (módulo de estoque); sem lotes, a simulação mostra lista vazia.
- O cenário `fora_de_ordem` só é rotulado no seletor; `simulateOnlinePayment` da fundação não o reproduz.
- Limites/permissões são de interface; autorização real e retenção de logs dependem do servidor.

## Necessidades da fundação
1. `NotificationEvent` sem evento para “atendimento humano”/handoff — hoje a tarefa aparece só na fila de atendimento (aba WhatsApp), sem mensagem interna.
2. `notificationProvider.enqueue` não respeita quietHours, suppression list nem marketing/opt-in. O módulo usa `queueMessage` (engine.ts) por cima dele; outros módulos que chamam `enqueue` direto (ex.: `notifyPatient`, `offerSlot`) ignoram o horário silencioso.
3. Templates clínicos: campo estruturado de “data de retorno definida pelo profissional” para a automação de retorno.
4. Evento de domínio `proposal.pending`/agendador para varreduras periódicas (servidor).
