# Módulo comercial — CRM, orçamentos, financeiro, comissões, precificação, estoque, compras

Código: `src/modules/commercial/`. Regras puras/aplicação: `crm.ts`, `finance.ts`, `commissions.ts`, `pricing.ts`, `inventory.ts`, `purchasing.ts`, `effects.ts`.
Telas: `crmPage.tsx`, `proposalsPage.tsx`, `financePage.tsx`, `commissionsPage.tsx`, `pricingPage.tsx`, `inventoryPage.tsx`, `purchasingPage.tsx` (re-exportadas por `pages.tsx`).
Coleções próprias (declaration merging em `types.ts`): `crmStages, relationshipMessages, suppliers, financeCategories, costCenters, payables, chargeAdjustments, agreements, pixReviews, commissionRules, commissionClosings, commissionParams, pricingScenarios, serviceKits, purchaseOrders, equipment`.
Testes: `src/modules/commercial/commercial.test.ts` (19 testes, todos passando).

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Kanban com etapas padrão, renomear/ocultar por tenant | /crm → Funil, "Etapas" | frontend validado | — | — |
| Arrastar (HTML5) + alternativa acessível ("Mover para") | /crm | frontend validado (select) | — | — |
| Motivo de perda obrigatório | /crm | frontend validado | `CRM: exige motivo de perda` | — |
| Origem, responsável, tarefas com prazo, histórico | /crm → cartão (drawer) | frontend implementado | — | — |
| Bloqueio de diagnóstico no "interesse" | /crm | frontend implementado | `validateInterest` | — |
| Converter em paciente (patientRepo.create, checa duplicidade) e vincular proposta | /crm → drawer | frontend implementado | — | — |
| NPS simples, indicações, opt-out, limite de frequência | /crm → Relacionamento | frontend implementado | `opt-out e limite de frequência` | Envio real (Resend/Evolution): integração futura |
| Resposta → atendimento humano (PortalRequest) | /crm → Relacionamento | frontend implementado | — | — |
| Lista de orçamentos com filtros/status | /orcamentos | frontend validado | — | — |
| Editor: itens, desconto com limite, alternativas, opcionais, explicações, validade, parcelas, condições, responsável financeiro, custo previsto e margem | /orcamentos/:id | frontend validado | `validateDiscounts` (fundação) | — |
| Versões (nova versão revoga anterior), enviar, copiar link, revogar, recusa | /orcamentos/:id | frontend implementado | — | Link público: tela do módulo portal |
| Aceite presencial com seleção + parcelas; repetir não duplica cobrança | /orcamentos/:id → "Registrar aceite presencial" | frontend validado (2º aceite: "Nenhuma cobrança nova") | `aceite parcial sem duplicidade` | — |
| Perguntas do paciente + resposta da clínica | /orcamentos/:id | frontend implementado | — | — |
| Contas a receber: filtros, competência/vencimento/recebimento/disponibilidade | /financeiro → Contas a receber | frontend validado | `fluxo: recebido × disponibilidade` | — |
| Recebimento parcial/quitação via caixa aberto | /financeiro → drawer da cobrança | frontend validado (recepção, 390 px) | — | — |
| Juros/multa/desconto da política, com memória de cálculo | drawer da cobrança | frontend implementado | `juros/multa` | — |
| Estorno/reembolso/chargeback vinculados (sem apagar) | drawer da cobrança | frontend implementado | `estorno parcial/total e status` | Gateway: integração futura |
| Acordo/renegociação (cancela com vínculo, parcelas `acordo`) | Contas a receber → "Acordo" | frontend implementado | `acordo cancela saldo antigo` | — |
| Pix manual: fila, aprovar/recusar, histórico, aviso "não é confirmação bancária" | /financeiro → Pix manual | frontend implementado | — | Conciliação bancária: futura |
| Contas a pagar (fornecedor, categoria, centro de custo, parcelas, pagar/estornar) | /financeiro → Contas a pagar | frontend implementado | — | — |
| Caixa por unidade/operador: abrir/fechar com contagem e diferença, sangria/suprimento | /financeiro → Caixa | frontend validado (390 px) | — | — |
| Fluxo competência × caixa × disponibilidade (SVG) | /financeiro → Fluxo de caixa | frontend implementado | `cashFlow` | — |
| Recibo/demonstrativo com marca; NFS-e demonstrativa sem validade fiscal | /financeiro → Documentos | frontend implementado | — | NFS-e municipal: integração futura |
| Categorias, centros de custo, fornecedores | /financeiro → Cadastros | frontend implementado | — | — |
| Exportação CSV segura | DataTable `exportName` (respeita `export`) | frontend implementado | `toCSV` (fundação) | — |
| Regras de repasse versionadas (profissional/procedimento/faixa/período) | /comissoes → Regras | frontend implementado | `versão vigente` | — |
| Base bruta/líquida (taxas, laboratório, insumos, descontos) | /comissoes → Regras/Parâmetros | frontend implementado | `base líquida` | — |
| Fechamento → snapshot imutável com memória por item | /comissoes → Fechamentos | frontend validado (FEC-0001, 83 itens, v1/v2 aplicadas por data) | — | — |
| Sem dupla contagem; estorno → ajuste negativo no próximo | /comissoes | frontend implementado | `sem dupla contagem; estorno posterior` | — |
| Ajuste autorizado com motivo (approve) | /comissoes → "Ajuste autorizado" | frontend implementado | — | — |
| Aviso "NÃO equivale a split bancário" | /comissoes | frontend validado | — | — |
| Simulador: custo/hora, custo do procedimento, markup × margem, cenários salvos lado a lado | /precificacao | frontend validado | `simulador` | — |
| Produtos (unidade base, conversões, decimais), lotes, validade/alertas | /estoque | frontend validado | `conversão explícita` | — |
| Entrada (conversão), saída, perda, ajuste, inventário, transferência, reserva | /estoque → drawer do produto | frontend implementado | `entrada com conversão e transferência` | — |
| FEFO, lotes vencidos bloqueados, negativo configurável | /estoque | frontend implementado | `FEFO`, `negativo bloqueado` | — |
| Fichas técnicas por serviço | /estoque → Fichas técnicas | frontend implementado | — | — |
| `stock.low` + alerta (1/produto/dia) | efeito | frontend implementado | — | — |
| Compras: solicitação → aprovação → pedido → recebimento parcial → conta a pagar | /compras | frontend validado (perfil estoque sem "Aprovar"; recebimento ok) | — | — |
| Equipamentos: manutenção bloqueia `Resource.blocks` | /compras → Equipamentos | frontend implementado | — | — |
| `appointment.completed` → consumo único + cobrança da consulta | `effects.ts` | frontend implementado | `consumo único` | — |
| `appointment.cancelled` → NÃO devolve material | `effects.ts` (só audita) | frontend implementado | — | — |

Validação no navegador (http://localhost:5190, 1440 e 390 px): org_sorriso como owner, financeiro, estoque e recepção (fluxos), e org_vet owner. Sem erros de console e sem rolagem horizontal da página. Screenshots em `qa/tmp/com-*.png`. Scripts: `qa/tmp/comercial-shot.mjs`, `qa/tmp/comercial-flow.mjs`.

## Limitações reais
- Tudo é local, só para a demo (localStorage). Permissões são só de interface. Pagamentos, mensagens e NFS-e são simulados.
- O arrastar no Kanban funciona apenas com mouse (HTML5 DnD não funciona no toque). No celular e no teclado usa-se o select "Mover para". O script valida só o select.
- O juro é simples, pró-rata por dia (taxa mensal ÷ 30), e é aplicado manualmente ("Aplicar encargos"). Não há cálculo automático diário.
- A taxa do meio de pagamento na base líquida é um parâmetro gerencial informado, sem conciliação com o provedor.
- Quando falta saldo no consumo de um procedimento já realizado e o negativo está bloqueado, o sistema baixa o disponível e grava um movimento "FALTA" para conferência. O registro do atendimento não é bloqueado.
- A reserva não tem expiração automática.
- A transferência entre unidades é imediata (não há estado "em trânsito").
- O CRM bloqueia termos de saúde por heurística, sem garantia de cobertura.

## Necessidades da fundação (não editadas)
1. `billingRepo.registerPayment` grava `availableOn = hoje` para qualquer método. Cartão deveria ser D+N, conforme provedor/política. O seed já usa D+30 para crédito.
2. `recomputeStatus` só passa a 'vencida' quando há pagamento. A UI calcula o status efetivo (aberta + vencimento passado = vencida). Ideal: um recálculo central.
3. `simulateOnlinePayment` (payments.ts) calcula o saldo como `total − confirmados + refunds`. Num pagamento totalmente estornado, ele sai dos confirmados e o refund ainda é somado, então o saldo dobra. Hoje isso fica mascarado porque a cobrança vira 'estornada' e não aceita mais pagamento. Sugestão: usar `chargeBalance`.
4. `approveManualPayment(…, false)` remove o pagamento pendente da cobrança. O histórico fica em `pixReviews`, que é do módulo comercial. Ideal: manter o pagamento com status 'recusado'.
5. O contrato `InventoryRepository` menciona `src/modules/inventory/repo.ts`. A implementação real é `consumeForAppointment` em `src/modules/commercial/inventory.ts`.
6. A alternativa por toque ao arrastar (Pointer Events) poderia virar um componente `Kanban` compartilhado em `src/ui`.
