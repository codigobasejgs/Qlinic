# Pendências reais antes de contratar de verdade

Nada desta lista se resolve só com código. Enquanto houver item aberto, a jornada continua em **simulação** (com o bloqueio exibido em Super Admin → Contratação).

## Jurídico e comercial
1. **Revisão jurídica** do modelo (`CONTRATO_QLINIC_MINUTA.md`) com o Anexo A preenchido. Publicar só depois disso, marcando a revisão no Super Admin.
2. **Aprovação do quadro comercial**: preços (hoje demonstrativos), teste, renovação, reajuste, cancelamento/reembolso, suporte, SLA, backup, exportação e eliminação.
3. **Signatário da contratada**: titular ou procurador e o método de assinatura. Nada é presumido.
4. **Canais**: canal contratual, contato de privacidade, canais e horários de suporte. O telefone cadastral não é tratado como WhatsApp nem como atendimento 24 horas.
5. **Aviso de privacidade** da contratada publicado (a ciência dele é um aceite à parte).
6. **Conferência contábil do CNAE** e da emissão fiscal: o CNAE principal é treinamento em informática e os secundários não citam licenciamento/desenvolvimento de software. Tarefa aberta no Super Admin. Não altera o CNPJ e não indica irregularidade.

## Provedores
7. **Assinatura eletrônica**: escolher o provedor depois de verificar API, autenticação, dossiê, preço e validade. Implementar o `future` do `SignatureProviderAdapter` dentro de Edge Functions.
8. **Cobrança da plataforma** (Asaas, Mercado Pago ou InfinitePay) em conta própria do Qlinic, separada das contas das clínicas: homologação, webhooks e autorização de recorrência.
9. **Resend** (domínio verificado) e **Evolution** (instância da plataforma) para as notificações, sem CPF e com link autenticado.

## Backend
10. Tabelas, RLS, storage privado e Edge Functions descritos em `MODELO_SUPABASE.md`. No ambiente conectado, `/contratar` mostra “em preparação” e não grava dado real no navegador.
