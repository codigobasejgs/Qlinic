# Qlinic — Módulos Públicos, Demonstração, Identidade e Ajuda

Especificação implementada conforme `PROMPT_MASTER_QLINIC_CLAUDE_CODE-1.md` (seções 0, 3, 4, 6, 17, 18, 22, 23, 24) e `BRIEF_AGENTES.md`.

## 1. Tabela de requisitos e status

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Site comercial / Landing | `/` | frontend validado | Playwright (1440/1024/768/390/360 px, light/dark) | Provedores reais de PWA/marketing (futuro) |
| Páginas de segmento (7 segmentos) | `/segmentos/:segmento` | frontend validado | `src/modules/public/lib.test.ts` | — |
| Comparativo de planos (desktop/mobile) | `/planos` | frontend validado | `src/modules/public/lib.test.ts` | Gateway SaaS para cobrança real (futuro) |
| Catálogo de recursos com status honesto | `/recursos` | frontend validado | — | Integrações reais (futuro) |
| Seletor de demonstração | `/demonstracao` | frontend validado | Playwright + `lib.test.ts` | — |
| Criar clínica fictícia (trial) | `/demonstracao` | frontend validado | `src/domain/tenancy.ts` | Provisionamento de banco no servidor (futuro) |
| Vitrine de identidade visual | `/demonstracao/identidade` | frontend validado | `src/modules/public/lib.test.ts` (14 pares AA) | Registro definitivo da marca Qlinic |
| Login demonstrativo | `/auth/login` | frontend implementado | `src/modules/public/lib.test.ts` | Supabase Auth (futuro) |
| Recuperação de acesso simulada | `/auth/recuperar` | frontend implementado | `src/modules/public/lib.test.ts` | Provedor transacional (Resend) no servidor |
| Aceitar convite com regras de senha | `/auth/convite` | frontend implementado | `src/modules/public/lib.test.ts` | Tokens assinados no servidor |
| Verificação de e-mail | `/auth/verificar` | frontend implementado | `src/modules/public/lib.test.ts` | Envio de código OTP no servidor |
| MFA demonstrativo (TOTP + QR) | `/auth/mfa` | frontend implementado | `src/modules/scheduling/qr.test.ts` | TOTP com segredo no servidor |
| Central de ajuda pública | `/ajuda` e `/ajuda/:artigo` | frontend validado | `src/modules/help/routes.test.ts` | — |
| Central de ajuda da equipe | `/app/:slug/ajuda` e `/app/:slug/ajuda/:artigo` | frontend validado | `src/modules/help/routes.test.ts` | — |
| Checklist inicial persistido | `/app/:slug/ajuda` | frontend validado | `src/modules/help/routes.test.ts` | — |
| Tours guiados (15 tours) | `/app/:slug/*`, `/master/*`, `/c/:slug/portal/*` | frontend validado | `src/modules/help/routes.test.ts` (49 asserções) | — |
| Prints reais do frontend | `public/screens/*.png` | frontend validado | Playwright (`qa/tmp/public-shots.mjs`) | Telas de outros agentes recapturadas ao final |

Status:
- **frontend validado**: tela renderizada no Chromium headless via Playwright em `http://localhost:5190`, nos temas claro e escuro, nas larguras 360, 390, 768, 1024 e 1440 px, sem rolagem horizontal nem erros de console nos arquivos do escopo.
- **frontend implementado**: lógica, acessibilidade e formulários prontos com testes unitários, sem verificação visual em navegador dedicada nesta rodada.
- **integração futura**: funcionalidade depende de infraestrutura externa (backend Supabase, provedores de e-mail/WhatsApp/MFA, gateway de pagamento).

---

## 2. Limitações reais documentadas

1. **Autenticação demonstrativa**: As telas em `/auth/*` não autenticam de verdade, não consultam banco e descartam qualquer senha informada sem persistir. Servem para demonstrar feedback, regras de força, acessibilidade e fluxo de TOTP. Em produção, serão substituídas por Supabase Auth com sessão host-only por clínica.
2. **Dados fictícios em armazenamento local**: O seletor de demonstração grava sessões e alterações em `localStorage`/`sessionStorage`. Isso organiza a demonstração, mas **não é segurança de produto nem controle de acesso real**. A restauração de dados (`resetDemo`) apaga todas as clínicas modificadas neste navegador.
3. **Instalação do PWA**: A instalação depende do suporte do navegador. No iOS/iPadOS é obrigatório o fluxo manual (Safari → Compartilhar → Adicionar à Tela de Início). O ícone de um PWA já instalado pode demorar dias para ser atualizado pelo sistema operacional quando a clínica altera a identidade.
4. **Treinamento audiovisual**: Não foram gravados vídeos nesta fase. A central de ajuda deixa explícito que vídeos são produção audiovisual futura, oferecendo em seu lugar guias passo a passo com capturas reais e tours guiados passo a passo dentro do sistema.
5. **Prints reais**: Capturados em resolução nativa desktop (1440×900) e mobile (390×844) e otimizados abaixo de 250 KB por arquivo (`public/screens/*.png`). Telas ainda não implementadas por outros agentes são marcadas como `stub: true` em `src/modules/public/shots.json` e não são exibidas na landing/ajuda para evitar imagens quebradas.

---

## 3. Necessidades da fundação (relatadas aos demais agentes)

Nenhuma alteração foi feita fora do escopo atribuído. Apenas foram consumidos contratos existentes (`src/data/store`, `src/domain/*`, `src/ui/*`, `src/lib/*`). Sugestões de melhorias futuras para a fundação:
- **`QRCode` (src/modules/scheduling/qr.tsx)**: Hoje é um componente básico; a tela de MFA demonstrativo consome-o com fallback de chave textual para autenticadores manuais.
- **`platformDb.insert`**: Tipagem foi estendida via declaration merging em `src/modules/public/lib.ts` para as coleções locais `contactRequests` e `authEvents`, sem editar `src/domain/platform.ts`.
