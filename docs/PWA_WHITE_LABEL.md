# PWA white-label por contratante

## Decisão
Cada clínica tem **dois apps instaláveis com identidades e escopos distintos**:

| App | id | start_url | scope | Manifesto |
|---|---|---|---|---|
| Equipe | `/app/<slug>/` | `/app/<slug>/` | `/app/<slug>/` | `/t/<slug>/equipe.webmanifest` |
| Paciente/tutor | `/c/<slug>/portal/` | `/c/<slug>/portal/` | `/c/<slug>/` | `/t/<slug>/portal.webmanifest` |

- `id` é estável e **não muda ao trocar logo/cor** (a identidade visual versiona só os ícones: `?v=<brand.version>`).
- Nenhum manifesto de um tenant inicia em outro: `start_url` ⊂ `scope` ⊂ caminho do próprio tenant.
- O manifesto de exemplo `public/brand/pwa/manifest.example.webmanifest` (marca-mãe) **não** é ativado para tenants.
  Site comercial e Super Admin não declaram manifesto (não são apps instaláveis nesta fase).
- Futuro (subdomínio/domínio próprio): `https://<slug>.<raiz>/portal/` e `/equipe/`, manifesto servido pelo host verificado; origens separadas
  isolam storage e service worker por clínica, mas **não** substituem autorização no servidor + RLS.

## Geração (demonstração por paths)
`npm run icons` (`scripts/gen-tenant-pwa.mjs --png`) lê `src/data/seed/orgs.json` e gera em `public/t/<slug>/`:
`equipe.webmanifest`, `portal.webmanifest`, `icon.svg`, `maskable.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png` (conteúdo na zona segura de 80 %),
`apple-touch-icon.png` (180). Cor de texto do ícone escolhida por contraste (branco ou navy). URLs persistentes, nunca `blob:`.
`hasPublishedPwa(slug)` (`src/domain/tenancy.ts`) controla quando o `<link rel="manifest">` é injetado: clínicas criadas na demo **não** têm manifesto
publicado — a tela Marca e app declara a limitação (publicar ícones/manifesto dinâmicos exige backend com HTTPS e arquivos versionados).

O `<link rel="manifest">`, `theme-color`, favicon e `apple-touch-icon` são trocados por rota (`useDocumentBrand`). Chromium avalia o manifesto
no carregamento da página; por isso o deep link direto (`/app/<slug>/…`) já entrega o manifesto certo após hidratação.

## Service worker (`public/sw.js`, escopo `/`)
| Recurso | Estratégia |
|---|---|
| `index.html`/navegação | network-first; offline → shell em cache (app mostra aviso “Você está sem conexão”) ou `offline.html` |
| `/assets/*` (hash no nome) | precache via `asset-manifest.json` + cache-first |
| `/brand/*`, `/t/<slug>/*` | stale-while-revalidate, cache **por tenant** `qlinic-brand-<slug>-<versão>` |
| `/api/*`, `/auth/*`, `/proposta/*`, `?token=`, `*.webmanifest`, não-GET, cross-origin | **nunca** cacheado |

- Dados clínicos/financeiros da demo ficam no `localStorage` (não passam pelo SW). Dados clínicos offline reais = projeto futuro próprio.
- Troca de tenant/logout → mensagem `CLEAR_TENANT` remove caches de marca de clínicas.
- Atualização: novo SW fica em *waiting*; banner “Nova versão disponível” só aplica (`SKIP_WAITING`) com ação do usuário e avisa se houver
  formulário com alterações não salvas (`useConfirmLeave` marca `body[data-unsaved]`). Caches de versões antigas são apagados no `activate`.
- Rede: `navigator.onLine` + sonda real (`fetch` sem cache) — offline nunca confirma horário, pagamento ou assinatura.

## Instalação
`InstallAppButton`: usa `beforeinstallprompt` quando disponível; iOS → instruções Compartilhar → Adicionar à Tela de Início; estado “App instalado” em
`display-mode: standalone`; fallback = continuar no navegador. Não prometemos instalação universal, execução em segundo plano ou atualização instantânea
de nome/ícone já instalado.

## Push (preparado)
Permissão só por clique (`requestPushPermission`), estados suportado/negado/padrão/concedido na Central de preferências. Assinatura por
dispositivo/tenant/usuário e entrega exigem VAPID + backend (futuro). Handler `push`/`notificationclick` no SW abre o deep link do tenant correto.
Conteúdo de push sem diagnóstico, procedimento sensível ou dado clínico. Nenhum timer local simula push remoto.

## Vercel
`vercel.json`: rewrite SPA exceto `assets/`, `brand/`, `t/`, `sw.js`, `offline.html`; `sw.js` e manifestos com `no-cache`; assets `immutable`.

## Testes
Ver `QA_REPORT.md` (cenários 16 e 17): manifestos de duas clínicas (id/start_url/scope/ícones), deep link recarregado, offline com SW ativo,
instalabilidade no Chromium. Instalação física em iOS **não testada** (sem aparelho) — pendente.
