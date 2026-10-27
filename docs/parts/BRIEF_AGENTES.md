# Brief compartilhado — implementação dos módulos Qlinic

Você é um dos agentes que implementam o frontend do Qlinic **em paralelo**. A especificação completa está em
`PROMPT_MASTER_QLINIC_CLAUDE_CODE-1.md` (v1.1, raiz do projeto). Leia as seções indicadas no seu escopo e as
seções 3, 4 e 20 (princípios, design system, segurança de produto), que valem para todos.

## Regras de convivência (críticas)
- **Edite somente os arquivos/diretórios do seu escopo.** Outros agentes estão editando outros diretórios ao mesmo tempo.
- **Não edite a fundação**: `src/app/*`, `src/data/*`, `src/domain/*`, `src/ui/*`, `src/lib/*`, `src/pwa/*`, `src/styles/*`,
  `src/modules/register.ts`, `package.json`, configs. Se precisar de algo que falta, implemente localmente no seu módulo
  (ex.: helper em `src/modules/<seu>/lib.ts`) e **liste a necessidade** no seu relatório final.
- **Não instale dependências.** Stack disponível: React 19, react-router 7 (`import { Link, useNavigate, useParams, useSearchParams, Outlet, useOutletContext } from 'react-router'`), lucide-react (ícones), TypeScript strict.
- **Não inicie servidor.** Já há um Vite dev rodando em `http://localhost:5190` (HMR ativo).
- Nomes de export das páginas são **fixos** (o roteador em `src/app/routes.tsx` importa por nome). Substitua os stubs
  existentes no seu arquivo `pages.tsx` mantendo exatamente os mesmos nomes exportados. Pode dividir em vários arquivos
  e re-exportar.
- Estilos extras: crie `src/modules/<seu>/styles.css` e importe-o no seu `pages.tsx`. Use os tokens `var(--q-*)`
  (nunca cores hex soltas para texto/fundo, exceto ilustrações SVG). Classes prontas estão em `src/styles/app.css`
  (leia-o): `.card .panel .stack .row .grid .grid-2/3/4 .badge .alert .table .kanban .cal .month-grid .chip .kpi .timeline .steps .dropzone .doc-paper .kiosk .call-panel` etc.
- Saída de comandos: um hook do ambiente às vezes reescreve a saída do terminal. Rode comandos redirecionando para
  arquivo e leia o arquivo: `npx tsc -b --pretty false *> qa/tmp/<seu>-tsc.txt` (PowerShell) e depois leia.
  Para node: `& "C:\Program Files\nodejs\node.exe" script.mjs *> qa/tmp/<seu>-x.txt`.
- Typecheck é global: **filtre erros pelos seus caminhos**; erros de outros diretórios são de outros agentes em andamento.

## Requisitos de qualidade (todos)
- pt-BR com acentuação correta. Moeda via `formatBRL(cents)`; **dinheiro sempre em centavos inteiros** (`src/lib/money.ts`).
  Instantes ISO UTC; datas civis `YYYY-MM-DD` (`src/lib/dates.ts`: `formatDateTime`, `formatCivil`, `zonedParts`, `zonedToInstant`, `todayCivil`, `addDaysCivil`, `nowISO`, `demoBaseDate`).
- **Toda ação altera estado observável** (store) + feedback (`useToast`) + tratamento de erro (`useAction` captura `throw new Error('mensagem')`). Proibido botão que só mostra toast sem mudar dados. Proibido página "em construção".
- Fluxo externo simulado sempre com `<SimBadge />` ("Simulado — sem envio/cobrança real"). Nunca sugerir que é real.
- Nunca pedir/aceitar credencial real em formulário. Campos de chave/API = placeholder desabilitado + texto "configuração futura no servidor".
- Acessibilidade WCAG 2.2 AA: labels visíveis (`<Field label>` injeta id/aria), foco visível, alternativa por teclado/formulário a todo arrastar, `aria-live` em mudanças, áreas de toque ≥ 44px, tabelas com `caption`. Use `Dialog` (foco preso), `Tabs` (setas), `Combobox`.
- Responsivo 360 → 1440 px **sem rolagem horizontal da página**. Tabelas largas: `DataTable` (vira cartões no celular) ou `.scroll-x` interno. Mapas/odontograma: `ZoomPan`.
- Sem `dangerouslySetInnerHTML` (lint bloqueia). Sem dados reais: nomes fictícios, contatos `.exemplo.test`, telefones `(00)`.
- Densidade clínica: hierarquia clara, poucos cards decorativos, sem gradientes/glass. Uma ação principal por contexto.
- **Convenção de tour/ajuda:** na ação principal de cada página coloque `data-tour="primary-action"`; no wrapper do conteúdo principal `data-tour="page-content"`. Itens de menu já têm `data-tour="nav-*"`.
- Use `PageHeader` no topo de cada página da equipe. Respeite permissões: `t.can(resource, action)` / `t.scope(resource)` e módulos `t.moduleOn(m)`; quando o perfil não pode, mostre estado explicativo (não esconda silenciosamente ações essenciais).

## APIs disponíveis (leia os arquivos para detalhes)
- **Store** `src/data/store.ts`: `db.list/get/insert/update/remove/set(tenantId, colecao, ...)`, hook `useCollection(tenantId, 'colecao')`,
  `platformDb` + `usePlatformCollection` (Super Admin), `registerSeed(nome, ctx => [...])` (ctx.tenantId, ctx.get('outra')),
  `registerPlatformSeed`. Novas coleções: **declaration merging** no seu módulo:
  `declare module '@/data/store' { interface TenantCollections { minhaColecao: MeuTipo[] } }` + `registerSeed('minhaColecao', ...)` no seu `seed.ts`.
  Seeds devem ser determinísticos (`rng(hashString(...))` de `src/lib/util.ts`) e relativos a `demoBaseDate()`. Só tenants demo recebem seed (política automática).
- **Tipos núcleo** `src/domain/types.ts` (Organization, Unit, Resource, Professional, Service, StaffUser, Person, Patient, PatientLink, Appointment, WaitlistEntry, ClinicalRecord, ClinicDocument, FileAsset, TreatmentItem, Proposal, Charge, Payment, OutboxMessage, AuditEvent...). **Compartilhados entre módulos** `src/domain/modules.ts` (VaccineRecord, ExercisePlan, NutritionPlan, AestheticPackage, FormTemplate, FormResponse, Product, Lot, StockMovement, CashSession, Lead, PortalRequest — coleções já declaradas). Plataforma `src/domain/platform.ts`.
- **Casos de uso**: `src/domain/appointments.ts` (createAppointment, changeAppointmentStatus, rescheduleAppointment, validateAppointment, issueCheckInToken, checkInWithToken, callPatient), `scheduling.ts` (findConflicts, availableSlots, TRANSITIONS, canTransition, weeklyRecurrence), `waitlist.ts`, `proposals.ts` (acceptProposal, rejectProposal, newProposalVersion, proposalTotals, validateSelection, validateDiscounts, findProposalByToken), `payments.ts` (PROVIDERS com capabilities, simulateOnlinePayment, processWebhook, submitPixReceipt, setSimScenario), `cash.ts` (openCash, closeCash, cashMovement, receiveAtDesk, expectedCash), `settings.ts` (getPolicies, DEFAULT_POLICIES, overriddenPaths; coleção `settings`), `access.ts` (canSeeRecord, canSeeDocument, visibleClinicalAlerts), `permissions.ts` (MATRIX, can, scopeOf, labels), `tenancy.ts` (createTrialOrganization, validateSlug, slugify, hasPublishedPwa).
- **Repositórios** `src/data/repositories.ts`: patientRepo (findDuplicates), appointmentRepo, clinicalRepo (save bloqueia finalizado; finalize; addAddendum), documentRepo, billingRepo (registerPayment, refund), chargeNet, chargeBalance, approveManualPayment, notificationProvider.enqueue (dedupe + preferências), audit(...).
- **Eventos** `src/data/events.ts`: `on('appointment.completed', fn)`, `emit(...)`. Efeitos de módulo vão no seu `effects.ts` (importado eagerly).
- **Sessão/tenant** `src/app/session.tsx`: `useTenant()` → `{ org, tenantId, units, allowedUnits, unitId (null = todas permitidas), unit, user, effectiveUser, access, can, scope, moduleOn, base ('/app/slug'), viewingAs }`; `useActor()` → `{id,name}` para trilhas; `usePortal()` → `{ org, person, base }`; `useDraft(key, initial)` (rascunho limpo na troca de tenant); `setSession`, `useSession`.
- **UI** `src/ui/index.ts`: Button, ButtonLink, Field, Input (prop `mask`), Select, Textarea, Checkbox, Segmented, Badge(tone), SimBadge, Alert, PageHeader, Breadcrumbs, EmptyState, ErrorState, Skeleton, Kpi, Timeline, Tabs/TabPanel, Pagination, Combobox, Progress, Section, Avatar, DescList, Dialog (prop `drawer`), useToast, useConfirm (`{title, body, danger, requireReason}` → `{ok, reason}`), useAction, DataTable/Column, FileUpload, SignaturePad, ImageCompare, DocumentEditor/fillTemplate, ZoomPan, DemoPaper (marca d'água), QlinicLogo, ClinicLogo, ThemeToggle, useTheme, PatientPicker, usePatientParam, useLookup.
  Máscaras em `src/lib/util.ts` (maskCPF, maskPhone, maskCNPJ, maskCEP, isValidCPF), `toCSV` (seguro contra formula injection), `parseCSV`, `downloadText`, `uid`, `abbreviateName`, `normalize`, `cx`.
- **PWA** `src/pwa/client.tsx`: InstallAppButton, OfflineNotice, NetworkStatus, useConfirmLeave(dirty), pushState, requestPushPermission, isStandalone, isIOS.

## Dados demo (IDs)
Tenants demo: `org_sorriso` (sorriso-pleno, odontologia, **2 unidades** `org_sorriso_u1`/`_u2`), `org_vitta` (clinica-vitta, medicina),
`org_vet` (vet-amigo, veterinária), `org_lumiere` (lumiere-estetica), `org_escuta` (espaco-escuta, psicologia), `org_movimento`
(movimento-fisio), `org_nutri` (nutri-equilibrio). IDs: unidades `<t>_u1`, profissionais `<t>_pro1..`, serviços `<t>_svc1..`,
pacientes `<t>_pat1..`, pessoas `<t>_per1..`, staff `<t>_usr_owner|recepcao|financeiro|estoque|auxiliar|gestor|pro1..` (Sorriso também `gestor_rede`, `gestor_u2`).
Paciente/pessoa 1 é o usuário do portal (na veterinária, tutor `org_vet_per1` tem Thor `org_vet_pat1` e Luna `org_vet_pat2`).

## Ver suas telas no navegador (Playwright, Chromium já instalado)
Defina a sessão antes de navegar (localStorage `qlinic.session`):
- Equipe: `{"kind":"staff","tenantId":"org_sorriso","userId":"org_sorriso_usr_owner","unitId":null}`
- Recepção: `{"kind":"staff","tenantId":"org_escuta","userId":"org_escuta_usr_recepcao","unitId":"org_escuta_u1"}`
- Portal: `{"kind":"portal","tenantId":"org_vet","personId":"org_vet_per1"}`
- Plataforma: `{"kind":"platform","role":"platform_owner","userId":"pu_owner"}`
Exemplo: script em `qa/tmp/<seu>-shot.mjs` com `import { chromium } from '@playwright/test'`, `page.addInitScript(() => localStorage.setItem('qlinic.session', '...'))`,
`page.goto('http://localhost:5190/app/sorriso-pleno/agenda')`, `page.screenshot({ path: 'qa/tmp/<seu>-agenda.png', fullPage: true })` em 1440 e 390 px;
colete `pageerror`/console errors. **Revise visualmente as screenshots** (Read na imagem) e corrija problemas.

## Testes
Lógica não trivial do seu módulo (cálculos, regras, transições) → arquivo `src/modules/<seu>/*.test.ts` com vitest
(`import { describe, it, expect } from 'vitest'`). Ambiente node: o store funciona em memória; não importe arquivos que tocam
`window` no topo (ex.: `src/pwa/client.tsx`, componentes). Rode: `npx vitest run src/modules/<seu> *> qa/tmp/<seu>-test.txt`.

## Entregáveis do agente
1. Implementação completa do escopo, sem stubs remanescentes.
2. `npx tsc -b` sem erros nos seus arquivos; `npx eslint src/modules/<seu>` sem erros.
3. Screenshots revisadas (desktop 1440 + celular 390) das telas principais, salvas em `qa/tmp/`.
4. `docs/parts/<seu>.md`: tabela `| Requisito | Rota/Tela | Status | Teste | Dependência externa |` (status: "frontend implementado",
   "frontend validado" (só se verificou no navegador), "integração futura"), + lista de limitações reais e de necessidades da fundação.
5. Relatório final curto (o que fez, o que validou, o que ficou pendente). Não declare validado o que não verificou.
