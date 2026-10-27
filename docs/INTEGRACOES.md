# Integrações (contratos e estado)

> Nesta fase **todas** as integrações são simuladas no navegador, com selo “Simulado — sem envio/cobrança real”. Nenhuma credencial é aceita
> no frontend; campos de chave são placeholders desabilitados (“configuração futura no servidor”).

## Dois contextos financeiros separados
| | Contexto A — Plataforma | Contexto B — Clínica |
|---|---|---|
| Quem paga | Clínica → Qlinic (assinatura) | Paciente/tutor → clínica (serviços) |
| Dados | `subscriptions`, `saasInvoices` (plataforma) | `charges`, `payments`, `cashSessions` (por tenant) |
| Contas/credenciais | da Qlinic | da clínica (conta recebedora dela) |
| Telas | `/master/cobranca`, `/master/integracoes` | `/app/:slug/financeiro`, `/app/:slug/comunicacao` (Integrações) |
| Métricas | MRR/ARR | receita da clínica (nunca entra no MRR) |
Dinheiro clínico não passa pela conta da plataforma por padrão. “Qlinic Pay” é nome de interface, não serviço financeiro próprio.

## PaymentProvider (`src/data/repositories.ts`, `src/domain/payments.ts`)
`capabilities: checkout | pix | boleto | cartao | recorrencia | parcelamento | estorno | split` com valores `sim | nao | homologacao`.
Tudo não verificado = **homologacao** (“depende de homologação”) e nunca é habilitado por suposição.

| Provedor | Preparado | Observação |
|---|---|---|
| InfinitePay | checkout/link, acompanhamento, conciliação | não presumir split, subconta, boleto ou recorrência |
| Asaas | cobrança, split | elegibilidade da conta; base líquida e arredondamento conforme provedor |
| Mercado Pago | checkout, conexão de conta | split/marketplace só na modalidade autorizada; 1:1 ≠ 1:N |
| Pix manual | instruções, QR demonstrativo, comprovante | **aprovação humana**; não é confirmação bancária |

Fluxo simulado (`simulateOnlinePayment`): `createCharge` com `idempotencyKey = chargeId` → checkout → webhook confirma. Cenários selecionáveis
(Comunicação → Integrações): sucesso, falha, timeout (status desconhecido: **não** reenvia nem troca de gateway), webhook duplicado (ignorado por `eventId`),
fora de ordem (estorno antes da confirmação fica para conciliação). Redirect de checkout **não** confirma pagamento.

## Backend futuro (obrigatório antes de produção)
1. Verificar assinatura/autenticidade de webhook conforme cada provedor.
2. Tabela `webhook_events (provider, event_id unique, payload_hash, received_at, processed_at, result)` — dedupe.
3. Idempotência na criação de cobrança (chave por origem); retentativa nunca cria nova cobrança sem controle.
4. Eventos fora de ordem, retry com backoff, fila de falhas (DLQ) e conciliação periódica.
5. Guardar `provider_payment_id`, `tenant_id`, `unit_id`, `receiving_account_id`, referência de origem.
6. Sem troca silenciosa de gateway após timeout ambíguo.

## Resend (e-mail)
Templates transacionais versionados com prévia e marca; remetente padrão em subdomínio verificado da plataforma; nome exibido da clínica e Reply-To dela;
domínio próprio opcional com estados SPF/DKIM/DMARC demonstrativos — **valores DNS reais só retornados pelo provedor**. From de domínio não verificado é bloqueado.
Transacional × marketing separados (opt-in/opt-out), bounce/complaint/suppression. Links para o portal em vez de anexos clínicos.

## Evolution API (WhatsApp)
Adapter por tenant (URL/instância/versão = placeholders; nada assumido). QR de conexão demonstrativo, status, reconexão, conversas, mídia fictícia,
resposta e handoff humano. Transporte Evolution ≠ API oficial da Meta: sem promessa de status oficial.

## Fila de comunicação
Canais WhatsApp/e-mail/push; preferências da pessoa (`Person.communication`), horário permitido, dedupe por evento/destinatário/canal (`dedupeKey`),
tentativas, falha definitiva, fallback configurável. Status: `aceito_provedor` ≠ `entregue` ≠ `lido` — só com evidência correspondente.
Eventos: convite, recuperação, consulta solicitada, confirmação, lembrete, reagendamento, cancelamento, vaga ofertada, check-in, documento disponível,
proposta disponível, aceite, cobrança próxima, atraso, pagamento confirmado, retorno, vacina, sessão, estoque baixo, integração com falha, assinatura SaaS vencendo.

## Interfaces desacopladas (sem provedor ativo)
Assinatura eletrônica (rubrica/aceite demonstrativos ≠ ICP-Brasil), IA (respostas determinísticas), teleatendimento, prescrição, emissão fiscal (NFS-e
demonstrativa sem validade), TISS/TUSS (artefato marcado “demonstrativo — não homologado”).

## Referências para a etapa real (verificar versão vigente)
InfinitePay https://www.infinitepay.io/desenvolvedores · Asaas split https://docs.asaas.com/docs/split-de-pagamentos ·
Mercado Pago split https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration ·
Resend domínios https://resend.com/docs/dashboard/domains/introduction
