> **Histórico (commit d405006).** A jornada em /contrato e /contratar foi substituída pela contratação dentro de /planos. Relatório atual: QA_CONTRATO_NOS_PLANOS.md.

# QA — contratação, contrato e assinatura do SaaS

Data: 28/10/2026. Ambiente: build de produção (`vite preview`), Chromium desktop 1440×900 e Pixel 7, além de viewports de 360 e 390 px.
**Tudo simulado:** dados fictícios, assinatura com o rótulo “Simulação concluída”, marca d'água “DEMONSTRAÇÃO - NÃO ASSINADO”, sem envio de e-mail/WhatsApp e sem cobrança.

## Testes executados

| Suíte | Resultado |
|---|---|
| Unitários (`npx vitest run`), dos quais 16 são de contratação | **260/260** |
| E2E contratação (`e2e/contracts.spec.ts`) | **8/8** |
| E2E regressão completa (3 arquivos, inclui contratação) | **35/35** |
| Typecheck + lint | sem erros |

## Checklist do requisito

| # | Item | Como foi verificado | Status |
|---|---|---|---|
| 1 | Link “Contrato” no menu e no rodapé; CTA de cada plano | E2E: menu → `/contrato`, rodapé, `Assinar plano Essencial/Profissional/Rede` → `/contratar?plano=` com o plano marcado | ✅ |
| 2 | Dados da contratada exatos e somente leitura | Unit (`legalProfile`) + E2E (cartão sem inputs; sem “Qlinic Ltda”/“Código Base Ltda”) | ✅ |
| 3 | PJ e PF, validação, campos ausentes, falha de CEP, dados longos | Unit `validateParties`; E2E: foco no 1º erro com `aria-invalid`, CEP indisponível → preenchimento manual, razão social longa | ✅ |
| 4 | Valores idênticos no resumo, HTML, PDF e cobrança | E2E compara o total do resumo com o documento; unit confere `formatBRL(499000)` no snapshot; a cobrança usa `offer.totalCents` | ✅ |
| 5 | Mudança de plano após o aceite exige nova revisão | Unit: rascunho volta para `draft`, snapshot descartado e assinatura recusada | ✅ |
| 6 | Campos pendentes bloqueiam a assinatura | `findPlaceholders` em `freezeForReview`; unit e E2E sem `[..]`, `null`, `undefined` ou “a definir”; `realSignatureBlockers` bloqueia a assinatura real | ✅ |
| 7 | Assinatura parcial ≠ concluída; pagamento ≠ assinatura | Unit + E2E: `partially_signed`, pagamento confirmado sem ativação até a contratada assinar | ✅ |
| 8 | Duplo clique e webhook duplicado; eventos fora de ordem | Unit: um único envelope, replay = duplicado, `failed` após `confirmed` ignorado; E2E com `dblclick` | ✅ |
| 9 | Expirado/recusado, cobrança falha, retomar envelope cancelado | Unit: `voided` não retoma, nova versão marca a anterior como `superseded`; E2E: cobrança recusada e nova tentativa; timeout bloqueia nova cobrança até reconciliar | ✅ |
| 10 | Cópias e histórico nos dois painéis; template novo não muda o antigo | E2E: “Meu plano e contrato”; unit: hash preservado após publicar | ✅ |
| 11 | Tenant A × B | Demo: rascunho preso à `draftKey` (unit “outra sessão”); painel da clínica filtra por `tenantId`. **Sem alegação de segurança real**: o RLS está descrito em `MODELO_SUPABASE.md` | ⚠️ só demo |
| 12 | Print/PDF; mobile 360/390 e desktop | PDF A4 com 9 páginas, logo, Anexos A/B, quebras e controles ocultos; E2E sem rolagem horizontal | ✅ |
| 13 | Teclado, foco, erro associado, contraste, zoom 200% | Erros com `aria-describedby`, foco no título ao trocar de etapa, sumário com foco no título da seção, tokens AA já auditados no design system. Zoom 200% (1280 px → viewport de 640 CSS px com DPR 2): `/contrato`, plano e dados sem rolagem horizontal | ✅ |
| 14 | Nada sensível em cache PWA, URL, console ou analytics | SW ignora `/contratar`, `/meu-plano` e assinaturas (E2E lê o `caches`); URL só leva `?plano=`; sem erros de console; robots bloqueia `/contratar` | ✅ |
| 15 | Simulação nunca parece real | Selos fixos, marca d'água, “Simulação concluída”, sem IP/certificado/ICP | ✅ |

## Prints

`qa/screenshots/contratacao/`: contrato público (claro e escuro), planos com CTA, plano, dados, revisão e pagamento em desktop; dados a 360 px e revisão a 390 px; `10-contrato-impressao.pdf` (A4). Gerar de novo: `node qa/contract-shots.mjs` com o preview rodando.

## Limitações conhecidas

- Zoom de 200% verificado por breakpoint, não com leitor de tela real.
- A consulta de CEP/CNPJ é simulada como indisponível (caminho de falha). A integração real é opcional e futura.
- A paginação “Página X de Y” depende de `@page` margin boxes (Chromium 131+). Em navegadores sem suporte, o PDF sai sem numeração.
