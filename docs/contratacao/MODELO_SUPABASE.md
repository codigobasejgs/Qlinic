# Contratação SaaS — modelo de backend (Supabase)

Status: **planejado, não implementado.** O frontend roda a jornada inteira em modo simulado (`src/modules/contracts`). Nada abaixo está em migração ainda. Antes de existir no banco é preciso: aprovação jurídica do modelo, quadro comercial aprovado e um provedor de assinatura contratado e homologado.

## Tabelas (schema `public`, todas com RLS)

| Tabela | Conteúdo | Leitura | Escrita |
|---|---|---|---|
| `platform_legal_profiles` | dados públicos da contratada (nome empresarial, CNPJ, endereço, canais) | anon: só os campos públicos, por view | platform_owner |
| `platform_legal_private` | signatário autorizado, credenciais e configuração do provedor (por referência ao Vault) | platform_owner | platform_owner |
| `contract_templates` / `contract_template_versions` | modelo versionado, status (`minuta`/`publicado`/`arquivado`), revisão jurídica/comercial com o nome de quem revisou | anon: apenas `publicado` | platform_owner |
| `commercial_offers` | quadro comercial versionado (termos), vínculo com `plans` e versão | anon: aprovado | platform_owner/finance |
| `saas_contracts` | `id`, `number`, `kind` (contrato/aditivo), `amends_contract_id`, `tenant_id` nullable, `template_version_id`, `offer_snapshot jsonb`, `status`, `payment_status`, `saas_status`, `fingerprint`, `superseded_by` | membro da org (owner/gestão) + plataforma | **somente RPC/Edge Function** |
| `contract_parties` | contratante e signatário; CPF em coluna separada com acesso restrito | owner da org, signatário, platform_owner | Edge Function |
| `signature_envelopes` | `provider`, `provider_envelope_id`, `document_hash`, `status`, `expires_at` | idem contrato | Edge Function (service role) |
| `signature_events` | eventos do webhook: `event_id` único, payload verificado, resultado (aplicado/duplicado/ignorado) | platform_owner | Edge Function |
| `contract_documents` | caminho no storage privado (PDF a assinar, PDF final do provedor, dossiê), sha256 | partes autorizadas via URL assinada de curta duração | Edge Function |
| `contract_amendments` | vínculo explícito contrato anterior → aditivo, descrição da alteração | idem contrato | Edge Function |
| `subscriptions_saas` / `charges_saas` | assinatura e cobranças da plataforma (Contexto A), `idempotency_key` único | org + plataforma | Edge Function |

## Regras invioláveis

- **Imutabilidade lógica.** Trigger bloqueia UPDATE em `offer_snapshot`, `template_version_id` e partes quando `status <> 'draft'`. Correções viram novos eventos ou uma nova versão (`superseded`).
- **Separação de estados.** `status` (contrato), `payment_status` e `saas_status` mudam apenas por RPC, e cada transição é validada (mesma máquina de `src/domain/contracts.ts`: `applyEnvelopeEvent`, `applyPaymentEvent`, `canActivate`).
- **Ativação.** Só ocorre por função `SECURITY DEFINER` chamada depois de um webhook verificado: todas as assinaturas exigidas + regra da oferta (pagamento confirmado quando a cobrança é imediata). Nunca por parâmetro da URL de retorno.
- **Idempotência.** `UNIQUE (provider, event_id)` em `signature_events`; `UNIQUE (idempotency_key)` em `charges_saas`; um envelope por par (contrato, revisão).
- **Webhook.** A Edge Function confere a assinatura HMAC do provedor, o timestamp, e se contrato, envelope e tenant correspondem. Guarda o arquivo assinado exato devolvido pelo provedor e as evidências dele.
- **Storage.** Bucket `contracts` privado, com caminho `tenant_id/contract_id/...` e política por membership. URL assinada de no máximo 10 minutos; a URL não substitui a autorização da aplicação.
- **Rascunho.** Fica no servidor, ligado ao `auth.uid()`, com `expires_at` igual à retenção configurada (job de limpeza). Nunca em `localStorage` no ambiente real.
- **CPF.** Fica em coluna/tabela de acesso restrito. Views de listagem só expõem a versão mascarada. CPF não vai para logs, analytics nem para o texto de mensagens.
- **Service role** apenas em Edge Functions.

## Edge Functions previstas

`contract-draft` (salvar/retomar), `contract-freeze` (renderiza o snapshot canônico, gera PDF, calcula sha256 e recusa placeholders), `contract-envelope` (cria, reenvia e cancela envelope no provedor), `signature-webhook`, `saas-checkout` (cobrança na conta da plataforma: Asaas/Mercado Pago/InfinitePay, conforme o adapter), `payment-webhook`, `contract-notify` (Resend: convite, cópia final, comprovante, aviso de falha; Evolution: só mensagem autorizada, com link autenticado e expirável, sem CPF).

## Mapeamento a partir do frontend

| Frontend (demo) | Backend |
|---|---|
| `platformDb 'legalProfile'` | `platform_legal_profiles` + `platform_legal_private` |
| `'commercialTerms'` | `commercial_offers` |
| `'contractTemplates'` | `contract_template_versions` |
| `'saasContracts'` | `saas_contracts` + `contract_parties` |
| `'signatureEnvelopes'` | `signature_envelopes` + `signature_events` |
| `SignatureProviderAdapter` (`mock`/`future`) | implementação real dentro de `contract-envelope`/`signature-webhook` |
