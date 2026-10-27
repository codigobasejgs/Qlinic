# Módulo: Portal do Paciente/Tutor e Páginas Públicas

Implementação completa das rotas do paciente/tutor (`/c/:slug/portal/*`) e das páginas públicas da clínica
(`/c/:slug`, `/c/:slug/agendar`, `/c/:slug/proposta/:token`), com identidade visual da clínica prevalecente,
mobile-first (390 px / 1440 px), separação rigorosa entre dados clínicos e financeiros conforme o vínculo, e
tratamento de rede offline (nada é confirmado offline).

## Tabela de requisitos e validação

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Layout do portal: bottom-nav mobile, seletor de dependente/animal, InstallAppButton, DemoBanner, ThemeToggle, OfflineNotice, marca da clínica prevalecente | `/c/:slug/portal/*` | frontend validado | `portal-flow.mjs` (vet: Thor x Luna), screenshots 390 e 1440 | Autenticação própria futura (substitui DemoSession) |
| Início: próxima consulta, confirmação, pendências (formulários, propostas, assinaturas, pagamentos), documentos e pagamentos em aberto | `/c/:slug/portal` | frontend validado | `portal-vet-home-390.png`, `portal-sorriso-home-1440.png` | Notificações push reais no backend |
| Agendar no portal: `availableSlots` com avanço mínimo/máximo da política, sinal/depósito simulado, persistência no mesmo tenant | `/c/:slug/portal/agendar` | frontend validado | `portal-flow.mjs` (n0 → n0+1, status 'solicitada'), `portal-sorriso-agendar-390.png` | Bloqueio de concorrência com transação ACID no servidor |
| Consultas: abas próximas/anteriores, confirmar presença, reagendar dentro da política, cancelar com motivo, QR de check-in temporário no dia | `/c/:slug/portal/consultas` | frontend validado | `src/modules/portal/lib.test.ts` (janela), `portal-flow.mjs` (cancelar com motivo persistido) | Validação do QR no totem via servidor |
| Documentos: somente documentos emitidos e `releasedToPortal`; recibo exige permissão financeira, clínicos exigem clínica; assinatura demonstrativa (SignaturePad com trilha); projeção de `portalGuidance` (nunca registro interno) | `/c/:slug/portal/documentos` | frontend validado | `src/modules/portal/lib.test.ts`, `portal-flow.mjs` (termo assinado e conferido no store), `portal-escuta-documentos-390.png` | Certificado ICP-Brasil / provedor qualificado futuro |
| Pagamentos: simulação com cenários (sucesso, falha, timeout, duplicado) sem falso pagamento; Pix manual com QR demonstrativo e envio de comprovante pendente de conferência; download de recibo texto | `/c/:slug/portal/pagamentos` | frontend validado | `portal-flow.mjs` (1ª parcela paga, falha não registra, pix manual pendente), `portal-sorriso-pagamentos-390.png` | Webhooks verificados por assinatura no backend, gateway real |
| Formulários: resposta de `FormTemplate` versionado; tipos text, textarea, number (min/max), date, single, multi, boolean, section; `showIf` reativo; validação com erros vinculados; rascunho persistido; envio | `/c/:slug/portal/formularios` | frontend validado | `src/modules/portal/lib.test.ts` (validação e cleanAnswers), `portal-flow.mjs` (4 erros vinculados), `portal-vitta-formularios-390.png` | Upload de anexos a formulários no backend |
| Propostas do paciente: reaproveitamento integral da experiência de proposta; seleção de alternativas (rádio por optionGroup), opcionais (checkbox), totais dinâmicos, parcelamento, perguntas, assinatura demonstrativa, pagamento da 1ª parcela | `/c/:slug/portal/propostas` | frontend validado | `src/modules/portal/lib.test.ts` (alternativas), `portal-flow.mjs` (aceite 3 parcelas, aditivo 6 parcelas sem duplicidade), `portal-sorriso-propostas-390.png` | Token com revogação e expiração via servidor |
| Tratamento: linha do tempo, pacotes estéticos com progresso, exercícios com adesão declarada do dia, plano nutricional por refeição | `/c/:slug/portal/tratamento` | frontend validado | `portal-movimento-tratamento-390.png` | Armazenamento de vídeos de exercícios |
| Vacinas veterinárias: carteira de vacinação filtrada estritamente pelo animal ativo (Thor x Luna sem vazamento cruzado); estado vazio explicativo para outros segmentos | `/c/:slug/portal/vacinas` | frontend validado | `portal-flow.mjs` (Thor 3 vacinas, Luna 2 vacinas), `portal-vet-vacinas-390.png` | Lembretes de vacina via Evolution/WhatsApp |
| Preferências: canais de comunicação (whatsapp, email, push, marketing), horário de silêncio, status de push por clique (suportado/negado/pendente/concedido); aviso de que notificações não contêm dados clínicos | `/c/:slug/portal/preferencias` | frontend validado | `portal-escuta-prefs-390.png` | Servidor push (VAPID + web-push) |
| Perfil: dados cadastrais (Person), pacientes vinculados com badges de permissão, sessões ativas (este navegador), solicitação de atendimento humano e solicitação de exportação de dados (LGPD) | `/c/:slug/portal/perfil` | frontend validado | `portal-escuta-perfil-390.png` | Motor de geração de arquivo zip de exportação LGPD |
| Página pública da clínica: marca da clínica, headline, sobre, serviços com preço (se `showPrices`), profissionais (se `showProfessionals`), unidades com horários por dia da semana e feriados, CTA agendar e portal, PWA install | `/c/:slug` | frontend validado | `portal-vitta-publica-390.png`, `portal-vitta-publica-1440.png` | Hostname customizado via Cloudflare for SaaS |
| Agendamento público sem login: wizard 3 etapas (serviço/horário → dados mínimos com consentimento → confirmação); `findDuplicates`: se duplicado, NÃO mescla — cria solicitação com tags e auditoria para revisão | `/c/:slug/agendar` | frontend validado | `portal-flow.mjs` (erros vinculados, cadastro criado com `duplicateOf`, agendamento 'solicitada'/'publico'), `portal-vitta-agendar-390.png` | Envio de código de verificação por SMS/WhatsApp |
| Link de proposta público: resolução por token opaco; link inválido/expirado/revogado mostra mensagem segura genérica sem vazar dados; experiência completa de aceite/recusa/perguntas/pagamento | `/c/:slug/proposta/:token` | frontend validado | `portal-flow.mjs` (token válido interativo, token inválido 'Link indisponível'), `portal-sorriso-link-390.png` | Token seguro assinado no backend (JWT/HMAC) |
| Seed: solicitações `portalRequests` por tenant; consultas futuras, cobranças e documentos para paciente 1 garantidos | `seed.ts` | frontend validado | `portal-flow.mjs` (consultas, cobranças e documentos verificados no store) | Nenhuma |

## Regras de visibilidade e segurança demonstrativa implementadas

1. **Separação clínico × financeiro:**
   - No vínculo (`PatientLink`), `canSeeClinical` controla acesso a documentos clínicos (atestados, laudos, orientações), aba de tratamento, vacinas veterinárias e texto de orientação (`portalGuidance`).
   - `canSeeFinancial` controla acesso a recibos, propostas, cobranças, simulação de pagamento e comprovantes Pix.
   - `canSchedule` controla criação, confirmação, reagendamento e cancelamento de consultas.
2. **Projeção de prontuário:**
   - O portal **nunca** renderiza o objeto `ClinicalRecord` completo nem o campo `content` (notas SOAP, odontograma interno, anamnese).
   - Somente registros com `releasedToPortal === true`, status `finalizado` e confidencialidade `padrao` projetam o campo `portalGuidance`. Registros com `confidentiality === 'restrito'` (ex.: psicologia) são sumariamente ignorados.
   - Documentos de exemplo são protegidos com a marca d'água demonstrativa `<DemoPaper>`.
3. **Resiliência a rede offline:**
   - Hooks e fluxos usam `useNetworkStatus()`.
   - Botões críticos (agendar, solicitar horário, confirmar presença, reagendar, cancelar, assinar documento, pagar online, enviar Pix manual, enviar formulário, enviar solicitação) ficam desabilitados quando offline, acompanhados da mensagem explícita `"Sem conexão: nada é confirmado offline. Reconecte-se para continuar."`.
   - Nas funções de ação foi adicionada a guarda defensiva `requireOnline(online)` para impedir execução mesmo que o atributo disabled seja burlado.
4. **Prevenção de duplicidade em proposta:**
   - `acceptProposal` calcula cobranças apenas para `newItems = selected.filter(id => !alreadyCharged.has(id))`.
   - Aceitar itens adicionais em momento posterior gera apenas o delta financeiro, mantendo as cobranças anteriores intactas.
5. **Agendamento público sem login:**
   - Nunca mescla automaticamente pacientes. Se `findDuplicates` acusar correspondência (nome + telefone/CPF), o paciente novo recebe a propriedade `duplicateOf` e a tag `'Revisar duplicidade'`, além de registrar um evento de auditoria `paciente.duplicidade_sugerida` para conferência humana pela recepção.
   - A confirmação ao visitante é sempre `"Solicitação recebida — a clínica confirmará"`, com `<SimBadge>` e sem prometer reserva garantida.

## Limitações reais e necessidades da fundação

### Limitações do protótipo
- **Autenticação:** A demonstração utiliza `DemoSession` (`localStorage.getItem('qlinic.session')`). Em ambiente produtivo, o acesso ao portal exigirá link mágico/OTP por WhatsApp/e-mail ou autenticação por senha com MFA, sempre com cookies `HttpOnly` e escopo `host-only`.
- **Assinatura:** `SignaturePad` gera rubrica em Canvas ou aceite por nome digitado gravado em `SignatureFlow`. Isso é expressamente demonstrativo e não possui equivalência jurídica a certificado ICP-Brasil (necessário adapter de provedor como DocuSign/Clicksign/ZapSign no backend).
- **Pagamento:** Webhooks e checkouts são simulados com `sessionStorage`. O backend futuro precisará verificar HMAC da assinatura do webhook, deduplicar `eventId`, persistir `providerPaymentId` e registrar conciliação no ledger.
- **Push:** A interface solicita a permissão nativa (`Notification.requestPermission()`) via clique do usuário, mas a emissão remota requer chave VAPID, registro de `PushSubscription` no banco e rotina de despacho no servidor.
- **Upload:** `FileUpload` lê arquivos localmente via `FileReader` (`dataUrl`). Arquivos reais devem ser enviados a bucket com URL assinada e sanitização prévia contra malware.

### Necessidades da fundação (listadas para a plataforma)
- **Store / Declaration Merging:** O módulo utiliza as coleções já declaradas em `@/domain/modules` (`portalRequests`, `vaccines`, `exercisePlans`, `nutritionPlans`, `aestheticPackages`, `formTemplates`, `formResponses`). Nenhuma alteração foi necessária no núcleo.
- **Tokens de proposta:** `findProposalByToken` hoje varre a coleção em memória. No servidor Supabase, tokens devem ter índice único, coluna `expires_at`, coluna `revoked_at` e rate limiting por IP para mitigar enumeração.
- **QRCode:** Utilizou-se o componente exportado em `src/modules/scheduling/qr.tsx`. O contrato funcionou perfeitamente tanto no check-in quanto no Pix demonstrativo.
