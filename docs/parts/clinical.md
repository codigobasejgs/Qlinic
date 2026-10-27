# Módulo Clínico (Prontuário, Atendimento, Documentos, Formulários)

Implementação do módulo clínico da Qlinic com foco em isolamento multi-tenant, rastreabilidade (adendos/auditoria), privacidade por perfil e simulações explícitas.

## Tabela de requisitos

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Lista de pacientes com busca, filtros (unidade, tag, status, convênio, espécie, tutor) e paginação | `/app/:slug/pacientes` | frontend validado | `clinical.test.ts` / `clinical-shot.mjs` / `clinical-flow.mjs` | Nenhuma (store local) |
| Cadastro de paciente com validação de CPF (`isValidCPF`), máscaras, data civil e tags | `/app/:slug/pacientes?novo=1` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Vínculos e responsáveis separados (Person + PatientLink) com permissões clínicas e financeiras independentes | `/app/:slug/pacientes?novo=1`, `/pacientes/:id` (aba Vínculos) | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Detecção de duplicidade ao salvar (`patientRepo.findDuplicates`) com aviso e opção de salvar | `/app/:slug/pacientes?novo=1` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Fila de "Possíveis duplicados" com revisão lado a lado e decisão manual (manter separados ou mesclar campo a campo com auditoria) | `/app/:slug/pacientes` (aba Possíveis duplicados) | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Ficha do paciente com identificação, linha do tempo unificada e atalhos para módulos de especialidade | `/app/:slug/pacientes/:id` | frontend validado | `clinical-shot.mjs` / `clinical-flow.mjs` | Nenhuma |
| Prontuário com lista de registros segundo `canSeeRecord`, badge de adendos e contagem de registros restritos ocultos | `/app/:slug/pacientes/:id` (aba Prontuário) | frontend validado | `clinical.test.ts` / `clinical-shot.mjs` | Nenhuma |
| Anamnese estruturada com problemas ativos/resolvidos, medicamentos, antecedentes e alertas/alergias editáveis | `/app/:slug/pacientes/:id` (aba Anamnese e alergias) | frontend validado | `clinical.test.ts` / `clinical-shot.mjs` | Nenhuma |
| Resumo animal: espécie, raça, pelagem, sexo, microchip e histórico de pesagens com gráfico tabular | `/app/:slug/pacientes/:id` (org_vet) | frontend validado | `clinical-shot.mjs` | Nenhuma |
| Galeria de arquivos com categorização, envio com progresso e falha simulável, substituição versionada sem recompressão | `/app/:slug/pacientes/:id` (aba Arquivos) | frontend validado | `clinical-shot.mjs` | Storage privado + links temporários assinados (futuro); DICOM diagnóstico exige visualizador específico |
| Financeiro do paciente em modo somente leitura (condicionado a `t.can('financeiro')`) | `/app/:slug/pacientes/:id` (aba Financeiro) | frontend validado | `clinical-shot.mjs` | Nenhuma |
| Modo consulta focado: histórico à esquerda e registro à direita por template da especialidade | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-shot.mjs` / `clinical-flow.mjs` | Nenhuma |
| Templates clínicos versionados com campos estruturados e validação de schema (ex.: SOAP v1/v2, odonto, psico, vet) | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Ação "Iniciar atendimento" quando status é `chegou` (`changeAppointmentStatus → em_atendimento`) | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Salvamento demonstrativo automático do rascunho (`useDraft`) com persistência em sessionStorage por usuário | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Alerta de alterações não salvas com `useConfirmLeave` (unload) e `useBlocker` (navegação interna) | `/app/:slug/atendimento/:id` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Estados de ciclo de vida do registro: rascunho → revisado → finalizado (`clinicalRepo.finalize`) | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Bloqueio de edição de registro finalizado e correção via adendo com autor, data e motivo | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Orientações ao paciente (`portalGuidance`) separadas do registro clínico, com checkbox explícito de liberação | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Ditado e transcrição simulados com consentimento prévio obrigatório, aviso visível ("GRAVANDO"), pausa, encerramento, retenção configurável e exclusão de áudio | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Provedor de ASR/transcrição (futuro) |
| Inserção da transcrição como rascunho ("sugestão — revisar") com aceitação trecho a trecho (nunca vira fato clínico sem revisão) | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Assinatura demonstrativa do registro com `SignaturePad` ao finalizar | `/app/:slug/atendimento/:id` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Ao finalizar: transição do agendamento para `concluida` e emissão do evento `record.finalized` | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Restrição profissional: profissional só edita seus próprios registros (scope `own`) | `/app/:slug/atendimento/:id` | frontend validado | `clinical.test.ts` / `clinical-shot.mjs` | RLS no banco de dados (futuro) |
| Separação rigorosa entre notas administrativas (`Appointment.notes`) e informação clínica | `/app/:slug/atendimento/:id` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Lista e filtros de documentos da clínica (tipo, status, portal) | `/app/:slug/documentos` | frontend validado | `clinical-shot.mjs` / `clinical-flow.mjs` | Nenhuma |
| Editor de documento com variáveis preenchidas (`{{paciente_nome}}`, `{{clinica_nome}}`, etc.) e modelos versionados | `/app/:slug/documentos?novo=1` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Prévia imprimível com `DemoPaper` (marca d'água "DEMONSTRAÇÃO — SEM VALIDADE") e `ClinicLogo` | `/app/:slug/documentos` | frontend validado | `clinical-shot.mjs` / `clinical-flow.mjs` | Nenhuma |
| Fluxo de assinatura demonstrativo com signatários em ordem, expiração, recusa motivada e trilha de eventos | `/app/:slug/documentos` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Provedor de assinatura eletrônica qualificada / ICP-Brasil (futuro) |
| Liberação explícita de documento ao portal com `emit('document.released')` e notificação sem conteúdo clínico | `/app/:slug/documentos` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Receitas e atestados mantidos como rascunho demonstrativo | `/app/:slug/documentos` | frontend validado | `clinical-shot.mjs` | Prescrição eletrônica certificada MEMED / CFM (futuro) |
| Construtor de formulários com 8 tipos de campo, validação min/max e condição showIf encadeada | `/app/:slug/formularios` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Prévia interativa do formulário com validação em tempo real e descarte de campos ocultos | `/app/:slug/formularios` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Publicação de novas versões imutáveis do formulário preservando versões e respostas anteriores | `/app/:slug/formularios` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Envio de formulário ao paciente (criação de `FormResponse` pendente para preenchimento no portal) | `/app/:slug/formularios` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |
| Visualização de respostas antigas renderizadas no schema da versão em que foram respondidas | `/app/:slug/formularios` | frontend validado | `clinical-flow.mjs` | Nenhuma |
| Seeds demonstrativos: 4 templates de formulário (geral v1/v2, odonto, vet, alimentar), respostas pendente e respondida antiga, e anamneses | `src/modules/clinical/seed.ts` | frontend validado | `clinical.test.ts` / `clinical-flow.mjs` | Nenhuma |

## Limitações reais desta fase (demonstração)

1. **Assinatura eletrônica**: as rubricas desenhadas e os aceites digitados são apenas demonstrações visuais sem carimbo de tempo certificado e sem equivalência jurídica a certificado ICP-Brasil (documentos exibem nota explícita).
2. **Prescrição e atestados**: ficam no estado de rascunho demonstrativo com marca d'água. Prescrição real exige integração futura com serviços homologados pelo CFM/CRF/MAPA.
3. **Ditado e transcrição**: opera com fixture determinística por especialidade com selo `SimBadge`. Nenhum microfone real grava áudio no navegador e nenhum modelo de LLM/ASR está conectado.
4. **Armazenamento de arquivos**: os uploads ficam em memória e em localStorage (data URL) com limite de 4 MB. Originais não são recomprimidos. Visualização de arquivos DICOM diagnósticos exige integração futura com PACS/visualizador DICOM específico.
5. **Segurança e RLS**: o controle de acesso por papel, unidade e escopo próprio (`own`) é verificado no frontend. Em produção, toda autorização clínica e isolamento de tenant deve ser garantido pelo backend via Row Level Security (RLS) no banco de dados.

## Necessidades da fundação (sem edição de arquivos fora do escopo)

1. **Exportação de `Patient` e vínculos**: componentes externos que precisem buscar dados de anamnese ou histórico de peso podem ler as coleções `anamneses` e o campo `Patient.weights`.
2. **Eventos consumidos**: o módulo emite `record.finalized` e `document.released`. Módulos de faturamento/estoque podem reagir ao fechamento do atendimento via `appointment.completed` (disparado pela finalização do registro).
