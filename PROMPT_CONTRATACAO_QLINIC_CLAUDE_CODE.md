# Qlinic - contratação, contrato e assinatura do SaaS

Complemento obrigatório ao prompt mestre. Versão 1.0 - 28/10/2026.

## Objetivo e escopo

Implemente a experiência completa de contratação de plano com contrato na landing, portal da clínica e Super Admin. Preserve os módulos e a identidade já definidos. Caso o projeto ainda esteja vazio, execute este módulo como parte do frontend geral, não como site isolado.

O contrato é entre a fornecedora do Qlinic e a empresa/profissional contratante do SaaS. Não confundir com contratos clínicos entre profissionais e pacientes. Use CONTRATO_QLINIC_MINUTA.md como modelo-base e dados-contratada.json como cadastro inicial. Os arquivos devem estar em docs/contratacao/ no pacote.

Não é autorização para contratar em nome de alguém, assinar documentos reais, enviar mensagens, cobrar cartões ou publicar termos juridicamente aprovados. Nesta fase frontend, implementar todos os fluxos com dados fictícios, estado persistente demonstrativo e selo de simulação. Não pedir segredos nem CPF real para testar.

## Experiência recomendada

1. Link “Contrato” no menu da landing e no rodapé: /contrato. Página de consulta pública com condições gerais vigentes, identificação da contratada e CTA “Escolher plano”. Não publicar contratos de clientes, CPFs ou evidências privadas.
2. Botões “Assinar plano” levam a /contratar?plano=ID. O termo assinar no CTA inicia a jornada, não registra uma assinatura automaticamente.
3. Etapas: plano e resumo financeiro → dados da empresa e signatário → revisão do contrato completo → assinatura eletrônica → pagamento → confirmação e onboarding.
4. Em teste gratuito, informar data de término e regra de cobrança; criar caminho próprio sem simular cobrança obrigatória quando não prevista. Nenhuma conversão paga escondida.
5. Ao concluir a assinatura das partes, disponibilizar a cópia final. O acesso pago só é ativado depois dos requisitos de assinatura e confirmação financeira; nunca a partir do parâmetro da URL de retorno.

## Dados iniciais da fornecedora

Preencher sem permitir edição pelo contratante:
- Produto: Qlinic (não declarar nome fantasia registrado).
- Nome empresarial: 59.760.458 MARCO ANTONIO BOGGIAN.
- CNPJ: 59.760.458/0001-91.
- Natureza informada: Empresário (Individual).
- Rua Jacques Pilon, 189, Vila Piauí, São Paulo/SP, CEP 05109-160.
- E-mail cadastral: marco.boggian@gmail.com.
- Telefone cadastral: (11) 3621-8304.
- Origem: comprovante anexado, emitido em 28/10/2026, não consulta online atualizada.

O CNPJ não informa nome fantasia. Não adicionar “Qlinic Ltda.”, “Código Base Ltda.” ou outra razão social. O nome de titular no cadastro não equivale a assinatura já concedida. Cadastro interno da contratada deve permitir definir signatário autorizado, cargo, método de assinatura, canal contratual, canal de privacidade e canais/horários de suporte. Não assumir que o telefone cadastral é WhatsApp ou atendimento 24 horas.

Importante para pré-lançamento: o CNAE principal do comprovante é treinamento em informática e os secundários exibidos não identificam expressamente licenciamento/desenvolvimento de software. Registrar tarefa de conferência contábil do enquadramento e emissão fiscal; não alterar o CNPJ nem afirmar irregularidade automaticamente. Não inserir CNAE inventado no contrato.

## Campos do cliente

Tipo PJ ou profissional PF; razão/nome, nome comercial, CNPJ/CPF conforme tipo, segmento, unidades, endereço completo, email de comunicação e telefone. Representante: nome, documento, cargo/qualidade, email de assinatura e declaração de poderes não pré-marcada. PF em nome próprio não precisa preencher uma empresa fictícia.

Validação de formato e dígitos não equivale a verificação de identidade ou poderes. Consulta de CEP/CNPJ é opcional, sujeita a integração, falha e edição manual. Nunca mostrar dados de outra pessoa ao digitar documento nem transmitir dados pessoais em query string. CPF completo restrito a quem precisa acessar o documento; não exibir na listagem do Super Admin, logs ou analytics.

Onboarding deve reaproveitar os dados da contratação. Botão voltar preserva dados. Rascunho com salvamento explícito e retomada. No demo, apenas dados fictícios; em produção, rascunho sensível no servidor com autenticação e prazo de retenção, não localStorage público.

## Quadro comercial dinâmico e imutável

Plano, versão, ciclo, valor total, equivalente mensal, desconto, preço posterior, implantação, franquias, excedentes, módulos, limites, renovação, teste, data inicial, encargos, reajuste, cancelamento, fidelidade, suporte, backup, exportação e retenção vêm da configuração aprovada e do snapshot da proposta.

Não usar preços arbitrários em contrato real. Validar todos os campos; não deixar colchetes, “a definir”, null ou undefined no PDF final. Se não aplicável, renderizar “não incluído” ou a regra correta. Modificações de plano ou partes após revisão invalidam aceites e envelope anterior ainda não concluído, gerando nova versão e nova revisão.

Separar templateVersion, offerVersion, contractId e signatureEnvelopeId. Alterar modelo no Super Admin não modifica contratos antigos. Aditivos vinculam explicitamente contrato anterior e alteração. Não inserir conteúdo novo no PDF após a assinatura.

## UI premium e acessível

Usar logos/tokens fornecidos, light/dark, stepper, resumo do plano visível e hierarquia clara. Desktop com formulário e resumo lateral; mobile com resumo compacto expansível, CTA sem sobrepor conteúdo e revisão legível. Não encaixar página A4 em miniatura como único modo de leitura móvel.

Dados da contratada em cartão de somente leitura com rótulos. Contratante editável. Contrato em HTML acessível com títulos navegáveis, baixar minuta e imprimir. No PDF/print, logo, partes, plano, versão, páginas e anexos sem corte. Controles/tours não aparecem na impressão.

Aceites distintos, não pré-marcados: concordância contratual e declaração de poderes. Ciência do aviso de privacidade não equivale a consentimento universal para tratamento de dados de saúde. Marketing opcional e separado. Disponibilizar texto integral antes do aceite; rolagem até o fim não prova leitura nem substitui manifestação de vontade.

## Assinatura eletrônica

Criar SignatureProviderAdapter com implementações mock e future-provider. Seleção do provedor fica configurável; não obrigar solução sem verificar API/condições. Poderá integrar provedor de assinatura adequado depois, conforme contratação real.

Preparar criação de envelope, signatários, ordem, autenticação, envio, expiração, reenvio, recusa, cancelamento, webhook, consulta do estado e download do original final/dossiê. Assinatura da contratada requer fluxo real do titular/procurador ou modalidade jurídica explicitamente validada; nunca colar rubrica ou gerar assinatura automática só porque os dados estão preenchidos.

Backend futuro gera snapshot canônico, PDF a assinar e hash antes do envio. Verifica autenticação/assinatura do webhook, idempotência e correspondência de contrato/envelope/tenant. Preserva arquivo assinado exato devolvido pelo provedor e evidências. Hash sozinho não comprova autoria, timestamp local não é carimbo certificado e checkbox não prova assinatura de ambas as partes.

Estados independentes:
- Contrato: draft, ready_for_review, pending_signatures, partially_signed, signed, declined, expired, voided, superseded.
- Pagamento: not_created, pending, confirmed, failed, refunded, disputed.
- Assinatura SaaS: pending_activation, trialing, active, past_due, suspended, canceled.

“signed” somente após todos os signatários exigidos. “active” somente após regras da oferta e eventos verificados. Reembolso não apaga contrato. Cancelar SaaS não invalida historicamente uma assinatura. Retry não duplica envelope/cobrança.

Frontend sem backend: todas as assinaturas usam “Simulação concluída”, watermark “DEMONSTRAÇÃO - NÃO ASSINADO” e dados fictícios. Não gerar número de certificado real, IP fictício como prova, selo ICP-Brasil ou evento de envio não realizado.

## Pagamentos e comunicação

Usar integrações de cobrança da plataforma Qlinic, separadas das contas de pacientes/clínicas. InfinitePay, Asaas e Mercado Pago conforme capacidades reais do adapter. Tela identifica recebedor da mensalidade e valor do ciclo. Assinatura do contrato não autoriza genericamente qualquer débito recorrente.

Pagamento pode ocorrer depois da assinatura do cliente enquanto a contratada conclui seu ato, mas ativação aguarda os requisitos definidos; mostrar essa condição. Preferência padrão de fluxo: ambas as assinaturas → pagamento → ativação. Tratar assinatura concluída com pagamento falho, pagamento confirmado com assinatura pendente e desistência antes de ativar. Não cobrar nova tentativa se a primeira estiver em estado incerto.

Resend: confirmação, convite de assinatura, cópia final, comprovante e aviso de falha, com templates e envio futuro pelo servidor. Evolution: somente mensagens autorizadas para o destinatário configurado, com link autenticado/expirável e sem CPF no texto. Não enviar contrato ou dados automaticamente por botão que só abre WhatsApp. Email enviado não prova entregue ou lido.

Preferir notificação com acesso autenticado ao documento. Cópia por anexo, quando habilitada, deve ser destinada ao signatário verificado, com registro e cuidados de minimização. Não tornar o bucket de contratos público. Link assinado de arquivo tem duração limitada e não substitui autorização da aplicação.

## Painéis

Super Admin: aba “Contratos SaaS”, filtros por cliente, plano, versão, status e período; detalhes, histórico, signatários, pagamento vinculado, baixar minuta/final, reenvio, cancelamento de envelope, geração de aditivo, evidências e auditoria. CPF mascarado nas listas. Perfil suporte não pode editar modelo ou forçar assinatura.

Configurações da plataforma: dados da contratada, signatários autorizados, modelos versionados, quadros comerciais, políticas, provedor, canais, lembretes, retenção e estado de aprovação. Publicação de modelo exige preencher campos obrigatórios e marcar revisão jurídica/comercial efetivamente realizada; não pré-marcar como aprovado.

Admin da clínica: “Meu plano e contrato”, ciclo, total, próximas cobranças, contrato final, aditivos, pagamentos, cancelamento com protocolo e exportação. Alterações cadastrais futuras não reescrevem documento histórico.

Página pública /contrato mostra somente modelo publicado sem dados de clientes. Na demo, modelo identificado como minuta e assinatura simulada. Documento final fica em rota privada com controle por tenant/representação. Tokens de assinatura não entram em cache offline/service worker, telemetria ou indexação; noindex não é controle de acesso.

## Modelo futuro Supabase

platform_legal_profiles, contract_templates, contract_template_versions, commercial_offers, saas_contracts, contract_parties, signature_envelopes, signature_events, contract_documents e contract_amendments; vínculos com subscriptions_saas e charges_saas.

RLS conforme organização e perfil; portal do signatário com acesso de finalidade restrita. Documentos/evidências em storage privado. Service role exclusivamente no servidor. Versionamento e trilha imutável lógica, correções por novos eventos. Configuração pública da contratada separada de CPF, credenciais e evidências privadas.

## QA obrigatório

1. Link Contrato na landing, CTA de cada plano e retorno ao fluxo correto.
2. Dados da contratada pré-preenchidos exatamente como a configuração; cliente não os altera.
3. PJ e PF, validação, campos ausentes, falha de CEP e dados longos.
4. Valores e limites idênticos no resumo, HTML, PDF e cobrança simulada.
5. Mudança de plano após aceite exige nova revisão.
6. Contrato com campos pendentes não pode iniciar assinatura real.
7. Assinatura parcial não aparece como concluída; pagamento não substitui assinatura.
8. Duplo clique e webhook duplicado não geram duplicatas; eventos fora de ordem não regridem estado.
9. Assinatura expirada/recusada, cobrança falha e tentativa de retomar envelope cancelado.
10. Cópias e histórico nos dois painéis; atualização do template não muda versão antiga.
11. Contrato de tenant A inacessível ao B no backend futuro; na demo, validar também rotas/UI sem alegar segurança real.
12. Print/PDF com logo, anexos, quebra de página e nomes longos; mobile 360/390 px e desktop.
13. Teclado, foco, erro associado ao campo, contraste e zoom 200%.
14. Nenhum documento sensível no cache PWA, URL pública, console ou analytics.
15. Simulação nunca indica assinatura válida, mensagem enviada ou pagamento real.

Entregar código, testes executados, prints demonstrativos, relatório de QA e pendências reais de backend/provedor/aprovação comercial. Concluir todo o frontend deste fluxo sem declarar produção jurídica/financeira pronta.
