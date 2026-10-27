# Módulo Super Admin — Plataforma Qlinic (Contexto A)

Documentação do módulo `src/modules/platform/**` para a especificação `PROMPT_MASTER_QLINIC_CLAUDE_CODE-1.md` (seções 3, 4, 5, 7, 14, 18, 19, 20).

## 1. Matriz de Requisitos e Telas

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| **1. MasterDashboard**: MRR normalizado por ciclo e cupom, ARR (= MRR × 12 a partir de ativas; nunca de receita de clínicas), clientes ativos, testes, conversão de teste, churn, inadimplência SaaS, uso vs. limites, falhas de integração. Cada métrica com definição e período. Gráfico SVG de MRR por mês com tabela alternativa. | `/master` (`MasterDashboard`) | frontend validado | `src/modules/platform/metrics.test.ts` (MRR/ARR/churn/conversão/inadimplência/margem) + E2E Playwright desktop/mobile + screenshot | Nenhuma (dados calculados do seed da plataforma). |
| **2. Contratantes**: lista com filtros (busca, status, segmento, plano), cadastro via `createTrialOrganization`, contagem de unidades não clínicas, detalhe com assinatura, faturas, uso, integrações, domínio, tickets e histórico unificado. Mudança de plano com explicação (ganhos/perdas/limites), extensão de teste, suspensão/reativação com motivo. Sem acesso a pacientes/prontuário. | `/master/contratantes`, `/master/contratantes/:tenantId` (`TenantsPage`, `TenantDetailPage`) | frontend validado | `metrics.test.ts` (planChangeImpact, currentUsage) + E2E Playwright de criação, mudança de plano, suspensão e reativação | Nenhuma. |
| **3. Planos**: preços por ciclo mensal/trimestral/anual com banner "preços de demonstração — não são decisão comercial", limites, módulos, excedentes, regras upgrade/downgrade, versão auto-incrementada, ativar/desativar. Atualização do tenant com interseção de módulos e alerta de limite. | `/master/planos` (`PlansAdminPage`) | frontend validado | `metrics.test.ts` (planChangeImpact) + validação Playwright desktop/mobile + screenshot | Nenhuma. |
| **4. Testes (trial)**: listagem com dias restantes, extensão com motivo (`trial.extensions`), expiração manual (preserva dados), conversão em assinatura ativa com emissão de fatura aberta com SimBadge. | `/master/testes` (`TrialsPage`) | frontend validado | `metrics.test.ts` (trialConversion, daysBetween) + E2E Playwright (extensão + conversão) | Gateway de pagamento em produção. |
| **5. Assinaturas**: ciclo, vencimento, cupons (criação, usos, validade), desconto manual com motivo, cancelar (data e motivo; não apaga dados), pausar, reativar, faturas avulsas e histórico unificado com auditoria. | `/master/assinaturas` (`SubscriptionsPage`) | frontend validado | `metrics.test.ts` (monthlyCents, cupons/descontos multiplicativos) + E2E Playwright (criação e aplicação de cupom QA10) | Gateway de recorrência em produção. |
| **6. Cobrança SaaS**: faturas `saasInvoices` com filtros, registro de pagamento simulado com regularização de assinatura inadimplente, estorno, conciliação manual (marcar/desmarcar; alerta de divergências), cards dos gateways da própria Qlinic (Asaas/Mercado Pago/InfinitePay — Contexto A) com SimBadge e capabilities. | `/master/cobranca` (`SaasBillingPage`) | frontend validado | `metrics.test.ts` (delinquency, nextInvoiceNumber, reconciliationIssue) + E2E Playwright (pagamento e conciliação) | Gateways reais e webhooks assinados. |
| **7. Integrações**: saúde por provedor/tenant (`integrations`), consumo agregado do mês, taxa de erro, logs sanitizados (sem e-mail/CPF/CNPJ/telefone/tokens), filas simuladas (pendente/falha/retentativa), reprocessar falhas com idempotência e simulação de webhook duplicado ignorado. Filtros por contexto plataforma/clínica. | `/master/integracoes` (`IntegrationsHealthPage`) | frontend validado | `metrics.test.ts` (sanitize, integrationFailures) + E2E Playwright (reprocessamento e deduplicação) | Webhooks e filas reais no backend. |
| **8. Domínios e PWA**: hostname por cliente (subdomínio ou próprio como exemplos — nunca CNAME/TXT inventados), verificação e certificado simulados, diagnóstico demonstrativo, checklist de instalabilidade, leitor e prévia do manifesto PWA real via fetch de `/t/<slug>/equipe.webmanifest` e `portal.webmanifest` quando `hasPublishedPwa(slug)`. Tenant desconhecido → erro seguro. | `/master/dominios` (`DomainsPwaPage`) | frontend validado | E2E Playwright com verificação simulada + leitura real de manifestos + screenshot + erro seguro para tenant sem PWA | Provedor de DNS/Cloudflare e emissão ACME. |
| **9. Suporte**: tickets com SLA configurável e tempo restante/estourado em tempo real, anexos fictícios, mensagens cliente/suporte, acesso assistido completo: solicitar (motivo, escopo, prazo) → simulação de autorização pela clínica → status ativo com banner visível e expiração automática/manual → revogação. Tudo registrado em `platformAudit`. Suporte nunca lê prontuários. | `/master/suporte` (`SupportPage`) | frontend validado | `metrics.test.ts` (slaState) + E2E Playwright (solicitar, autorizar, banner ativo, revogar) | Notificações push/e-mail para a clínica. |
| **10. Operação**: feature flags globais com rollout % e overrides por tenant, incidentes com timeline e severidades, avisos/anúncios (rascunho/publicado, público-alvo), changelog por versão, status do serviço derivado de incidentes abertos por componente. | `/master/operacao` (`OperationsPage`) | frontend validado | `metrics.test.ts` (componentStatus) + E2E Playwright (incidente degradando Agenda + override de flag) | Motor de flags e statuspage externa. |
| **11. Governança**: usuários internos da plataforma (`platformUsers`: criar, desativar, alterar papel), matriz de permissões visual por papel (`PLATFORM_MATRIX`), auditoria (`platformAudit`: filtros e exportação CSV segura contra formula injection), solicitações de exportação/encerramento (`dataRequests`: máquina de estados, retenção de registros clínicos documentada). | `/master/governanca` (`GovernancePage`) | frontend validado | `metrics.test.ts` (canTransitionRequest) + E2E Playwright (usuário, aprovação de solicitação, download CSV) | Exportação real de bucket e trilha imutável. |
| **12. Custos e margem**: consumo agregado do mês mais recente × premissas de custo unitário editáveis (armazenamento, mensagem, IA, fixo) × receita SaaS do tenant → margem SaaS. Alertas de limite (uso ≥ 80% / 100%), ordenação por menor margem / maior custo / maior uso. | `/master/custos` (`CostsPage`) | frontend validado | `metrics.test.ts` (estimatedCost, margin, limitLevel) + E2E Playwright (edição de premissas e recálculo dinâmico) | RUM, telemetria real e faturamento de provedores. |

---

## 2. Separação Estrita de Contextos (A vs. B)

- **Contexto A (Plataforma)**: a clínica paga assinatura à Qlinic (MRR, ARR, `saasInvoices`, faturas da própria Qlinic via Asaas/Mercado Pago/InfinitePay da plataforma).
- **Contexto B (Clínica)**: o paciente/tutor paga consultas e procedimentos à clínica (`charges` em `src/domain/types.ts`).
- **Regra inviolável**: valores transacionados pelas clínicas com pacientes **nunca** entram no MRR, no ARR, na inadimplência da plataforma nem no ranking de margem SaaS.
- **Suporte sem leitura de prontuário**: o Super Admin exibe apenas dados comerciais, métricas e contagens agregadas (`db.list(tenantId, 'units')`, contagem de pacientes/profissionais/usuários). Prontuários, evoluções clínicas, odontogramas e documentos de pacientes nunca são abertos no ambiente `/master`.
- **Acesso assistido**: desenhado com escopos explícitos (`configuracoes`, `agenda`, `financeiro`), prazo determinado, auditoria completa e exigência de autorização prévia da clínica.

---

## 3. Políticas Documentadas para Validação Posterior

1. **Suspensão Comercial**: a suspensão por inadimplência ou decisão comercial bloqueia novas operações pagas e marca a assinatura como pausada, mas **não apaga dados**, **não bloqueia exportação** e não impede consultas necessárias à continuidade do cuidado médico/odontológico/veterinário. O proprietário da clínica mantém acesso à solicitação de exportação.
2. **Encerramento de Conta e Retenção de Registros Clínicos**: solicitações de encerramento (`dataRequests`) cancelam a assinatura e desativam o acesso comercial, mas **não removem prontuários e documentos clínicos automaticamente**. Prazos de retenção regulatória (ex.: 20 anos em prontuário médico/odontológico no Brasil, normativas de veterinária e psicologia) devem ser avaliados caso a caso pelo jurídico antes de qualquer expurgo.
3. **Plano ≠ Feature Flag ≠ Permissão**:
   - *Plano*: franquia e conjunto de módulos que a clínica pode contratar.
   - *Feature flag*: mecanismo técnico de liberação progressiva (rollout) ou teste A/B.
   - *Permissão*: autorização por papel (`can(resource, action)` / `canPlatform(role, area)`). Um módulo habilitado no plano não concede permissão de acesso a usuários que não têm o papel correspondente.

---

## 4. Limitações Reais Desta Implementação

1. **Persistência Local (localStorage)**: todas as coleções residem em memória/localStorage através do store declarativo `platformDb`. Não há backend real nem isolamento de origem por processo; segredos de integração nunca são armazenados no frontend (campos desabilitados com indicação de configuração futura no servidor).
2. **Histórico de Plano Retroativo**: o gráfico de MRR dos últimos 6 meses calcula a série histórica aplicando o plano e ciclo atuais de cada assinatura na data retroativa, pois o store de demonstração não armazena snapshots de trocas de plano passadas.
3. **PWA por Tenant**: manifestos e ícones PWA reais e instaláveis existem em `public/t/<slug>/` apenas para as 7 clínicas de demonstração geradas em build. Tenants criados pelo visitante recebem diagnóstico demonstrativo seguro e alerta explícito de que não há manifesto publicado, sem reaproveitar identidade de outra clínica.
4. **Verificação de DNS/Domínios**: a página exibe hostnames de exemplo e diagnósticos simulados. Registros CNAME e TXT reais dependem de configuração pelo provedor de DNS/Cloudflare e nunca são inventados.
5. **Acesso Assistido Simulado**: a autorização da clínica é simulada por um botão demonstrativo com aviso claro de que, em produção, a ação é executada apenas pelo proprietário da clínica dentro do ambiente `/app/<slug>`.

---

## 5. Necessidades e Contratos com a Fundação

1. **Gateways da Plataforma no Backend**: endpoints autenticados no servidor para emissão real de faturas SaaS, webhooks com validação criptográfica de assinatura (HMAC), deduplicação por `eventId` em banco e conciliação bancária automática com split.
2. **TenantResolver no Servidor**: middleware para mapear `Host: <slug>.qlinic.com.br` ou `Host: app.clinica.com.br` para `tenantId` com verificação de certificado TLS wildcard/custom no Cloudflare/Vercel e tratamento seguro de host desconhecido (404 sem fallback).
3. **Trilha Imutável de Auditoria**: substituição do array `platformAudit` em localStorage por append-only log assinado no banco central (ex.: Supabase com RLS estrito onde apenas service_role insere eventos de plataforma).
4. **Exportação Assíncrona de Dados**: fila em segundo plano para geração de pacotes zip criptografados contendo JSONs de prontuário, arquivos e documentos em bucket privado com link pré-assinado temporário.
