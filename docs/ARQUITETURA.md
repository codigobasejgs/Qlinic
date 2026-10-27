# Arquitetura do frontend Qlinic

> Estado: demonstração usa `localStorage` (dados fictícios, sem controle de acesso real). Ambiente conectado usa Supabase com RLS como fonte da verdade — ver `BACKEND_SUPABASE.md`.

## Stack
React 19 · TypeScript 6 (strict) · Vite 8 · react-router 7 · lucide-react · Vitest · Playwright (QA). Gerenciador: npm (`package-lock.json`).
Sem biblioteca de estado, formulários ou gráficos: hooks + `useSyncExternalStore`, componentes próprios e SVG.

## Camadas
```
src/
  app/        rotas (routes.tsx), gates (TenantResolver), layouts, sessão demo, navegação
  domain/     tipos e regras puras + casos de uso (agenda, propostas, caixa, pagamentos, permissões, tenancy, settings)
  data/       store local versionado, seeds determinísticos, repositórios (contratos + mocks), eventos de domínio
  ui/         design system em componentes (core, overlay, table, widgets, brand, pickers)
  pwa/        cliente do service worker, instalação, rede, push preparado
  modules/    páginas por domínio (lazy): platform, scheduling, clinical, specialties, commercial, engagement, portal, settings, public, help
public/
  brand/      ativos oficiais da marca (não alterados)
  t/<slug>/   manifestos e ícones PWA por clínica seed (gerados por scripts/gen-tenant-pwa.mjs)
  sw.js       service worker
```
Domínios da spec → pastas: platform (`modules/platform`, `domain/platform.ts`), tenancy (`domain/tenancy.ts`, `app/gates.tsx`, `app/session.tsx`),
identity (`app/session.tsx`, `modules/public/auth.tsx`), scheduling, clinical, specialties, crm/billing-clinic/inventory (`modules/commercial`),
billing-saas (`modules/platform`), communication (`modules/engagement`), portal, branding (`ui/brand.tsx`, `lib/color.ts`, `modules/settings`), pwa, help.

## Tenancy
- Hierarquia: `Organization` → `Unit[]` → `StaffUser.memberships[] { role, unitIds | 'all' }`.
- Chaves de armazenamento: `qlinic:v1:t:<tenantId>:<coleção>`; plataforma: `qlinic:v1:platform:<coleção>`. Todo registro carrega `tenantId`; os de unidade carregam `unitId`.
- **TenantResolver** (`app/gates.tsx`): hoje por path (`/app/:slug`, `/c/:slug`). `resolveTenantSlugFromHost()` já define o contrato para hostname verificado
  (`<slug>.<raiz>` ou domínio próprio mapeado no servidor). Tenant desconhecido → tela segura “Clínica não encontrada” (nunca fallback).
- O slug da URL é **contexto**, não autorização: `StaffLayout` exige membership do usuário da sessão naquele tenant.
- Troca de organização (`setSession`): limpa rascunhos/seleções (`qlinic.draft.*`, `qlinic.sel.*`), descarta do cache em memória coleções de outros tenants
  (`evictOtherTenants`), avisa o SW (`CLEAR_TENANT`) e emite `qlinic:tenant-switch`. Providers usam `key={org.id}` para remontar a árvore.
- Path ≠ isolamento de origem: todas as clínicas na demo compartilham a origem; isolamento real exige subdomínio/domínio + autorização no servidor + RLS.

## Dados
- `data/store.ts`: coleções tipadas (`TenantCollections`/`PlatformCollections`, extensíveis por *declaration merging* nos módulos), seed lazy por coleção,
  `useCollection` (re-render por coleção), sincronização entre abas (evento `storage`), migração por versão de schema (versões antigas descartadas — dados fictícios),
  reset completo (`resetDemo`). Política de seed: só organizações `demo` recebem dados; criadas pelo visitante começam vazias.
- Seeds determinísticos (`lib/util.rng` + `hashString`) relativos à data-base configurável (`qlinic.demoBase`).
- `data/repositories.ts`: contratos `TenantRepository`, `PatientRepository`, `AppointmentRepository`, `ClinicalRecordRepository`, `DocumentRepository`,
  `BillingRepository`, `InventoryRepository`, `NotificationProvider`, `PaymentProvider`, `IdentityService` e implementações mock. Componentes dependem dos
  casos de uso/contratos, não do `localStorage`.
- `data/events.ts`: barramento síncrono (`appointment.completed`, `appointment.cancelled`, `proposal.accepted`, `payment.confirmed`, `record.finalized`,
  `document.released`, `stock.low`…). Ex.: concluir atendimento → estoque consome ficha técnica uma vez; cancelamento → automações de lista de espera.
  No backend vira *outbox* transacional + fila durável.

## Regras que vivem no domínio (testadas)
Dinheiro em centavos (`lib/money.ts`), parcelamento com soma exata, rateio por maior resto; fusos por unidade (`lib/dates.ts`);
conflitos/disponibilidade/transições de agenda (`domain/scheduling.ts`); aceite parcial idempotente (`domain/proposals.ts`);
recebimento parcial/estorno/idempotência por `providerPaymentId` (`data/repositories.ts`); caixa (`domain/cash.ts`);
webhooks simulados com dedupe por `eventId` (`domain/payments.ts`); herança de políticas rede→unidade (`domain/settings.ts`);
tokens de marca acessíveis (`lib/color.ts`); permissões demonstrativas (`domain/permissions.ts`).

## Integrações futuras
Contratos prontos e implementações simuladas; ver `INTEGRACOES.md` e `BACKEND_SUPABASE.md`. Nenhum segredo no frontend; `VITE_*` é público.

## Performance
Rotas lazy por módulo; nenhum chart/mapa no bundle inicial; SVG próprio; paginação em `DataTable`. Medições em `QA_REPORT.md`.
