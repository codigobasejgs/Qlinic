# Qlinic

ERP SaaS multi-tenant e multiunidade para odontologia, medicina ambulatorial, veterinária, estética, psicologia, fisioterapia e nutrição.
Dois ambientes no mesmo build:
- **Demonstração** (`/demonstracao`): dados fictícios no navegador, integrações simuladas.
- **Conectado** (`/auth/login`, quando `VITE_SUPABASE_*` está definido): Supabase Auth + Postgres com RLS, IA (Gemini) e WhatsApp (Evolution) reais via Edge Functions. Ver `docs/BACKEND_SUPABASE.md`.

Ainda simulados no conectado (dependem de contrato): pagamentos, e-mail transacional, worker da fila de mensagens, assinatura eletrônica, TISS, NFS-e, push, armazenamento de arquivos.
Antes de operar com pacientes reais: revisão jurídica/LGPD e auditoria de segurança. Nome e marca “Qlinic” são provisórios.

## Requisitos
Node 22+ e npm 10+. (Para regenerar ícones PWA e rodar E2E: `npx playwright install chromium`.)

## Instalação e scripts
```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # typecheck + build de produção em dist/
npm run preview      # serve dist/ em http://localhost:4173 (SW e PWA ativos)
npm run typecheck
npm run lint
npm test             # Vitest (regras de domínio)
npm run e2e          # Playwright (usa build: rode npm run build antes)
npm run icons        # regenera public/t/<slug>/ (manifestos + ícones por clínica)
```

## Como usar a demonstração
Abra `/demonstracao` e escolha clínica + perfil. Ambientes:

| Ambiente | Rota | Perfis |
|---|---|---|
| Site comercial | `/`, `/segmentos/:segmento`, `/planos`, `/recursos`, `/ajuda` | público |
| Identidade visual | `/demonstracao/identidade` | público |
| Autenticação (demonstrativa) | `/auth/login`, `/auth/recuperar`, `/auth/convite`, `/auth/verificar`, `/auth/mfa` | público |
| Super Admin | `/master/*` | proprietário, financeiro SaaS, suporte SaaS |
| Equipe da clínica | `/app/:slug/*` | proprietário, gestor da rede/unidade, recepção, profissional, auxiliar, financeiro, estoque |
| Página pública | `/c/:slug`, `/c/:slug/agendar` | público |
| Portal paciente/tutor | `/c/:slug/portal/*` | paciente, tutor, responsável |
| Totem / painel | `/c/:slug/totem`, `/c/:slug/painel` | quiosque |
| Proposta | `/c/:slug/proposta/:token` | link |

Clínicas fictícias: `sorriso-pleno` (odontologia, **2 unidades**), `clinica-vitta` (medicina), `vet-amigo` (veterinária), `lumiere-estetica`,
`espaco-escuta` (psicologia), `movimento-fisio`, `nutri-equilibrio`. Também é possível criar uma clínica nova (onboarding).
Banner permanente de demonstração com “Restaurar dados” (apaga tudo do navegador, com confirmação). Data-base configurável na página de demonstração.

## Limitações reais
- Persistência apenas no `localStorage` deste navegador (isolamento por namespace **não é segurança**).
- Pagamentos, WhatsApp, e-mail, IA, assinatura, TISS, NFS-e: simulados e marcados como tal.
- PWA instalável para as clínicas seed (manifestos gerados em build). Clínicas criadas na demo não têm manifesto publicado (exige backend).
- Push: só permissão/estado; entrega real exige backend. iOS físico não testado.
- Ver `docs/QA_REPORT.md` para o que foi efetivamente testado.

## Documentação
`docs/ESCOPO_E_STATUS.md` (rastreabilidade) · `docs/ARQUITETURA.md` · `docs/DESIGN_SYSTEM.md` · `docs/PERMISSOES.md` · `docs/PWA_WHITE_LABEL.md` ·
`docs/INTEGRACOES.md` · `docs/BACKEND_SUPABASE.md` · `docs/DEPLOY_GITHUB_VERCEL_CLOUDFLARE.md` · `docs/QA_REPORT.md` · `docs/PROXIMA_ETAPA_BACKEND.md` ·
identidade: `docs/IDENTIDADE_VISUAL.md`, `docs/Qlinic_Manual_de_Identidade.pdf`.
