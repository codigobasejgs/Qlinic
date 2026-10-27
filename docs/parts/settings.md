# Módulo de configurações (`src/modules/settings`)

Arquivos: `pages.tsx` (exports fixos + SettingsPage), `onboarding.tsx`, `org.tsx`, `catalog.tsx`, `policies.tsx`, `brand.tsx`,
`permissions.tsx`, `audit.tsx`, `reports.tsx`, `import.tsx`, `importer.ts`, `lib.ts`, `types.ts`, `seed.ts`, `styles.css`, `settings.test.ts`.
Coleções próprias: `importBatches`, `clinicProfile` (dados complementares da organização). Usa `settings` (fundação).

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Wizard 10 etapas com salvamento/retomada (`organization.onboarding.step/completed/data.saved`) | `/onboarding` | frontend validado | E2E `qa/tmp/settings-flows.mjs` (reload retoma etapa 2) | — |
| Onboarding de clínica criada por `createTrialOrganization` (sandbox, vazia) até concluir: `completed=true`, `publicPage.enabled` da etapa 7, status `onboarding→trial` | `/onboarding` | frontend validado | E2E (fluxo 4) | — |
| Checklist final com links para a etapa pendente | `/onboarding` etapa 10 | frontend validado | E2E | — |
| Organização: nome, CNPJ fictício (`maskCNPJ`), endereço (`maskCEP`), contatos `.exemplo.test`, links, responsável técnico | `/configuracoes?aba=organizacao`, etapa 1 | frontend validado | E2E | — |
| Segmento + módulos (feature flag) com aviso “fora do plano” | aba Organização, etapa 2 | frontend implementado | — | — |
| Unidades: horários por dia, fuso IANA, recursos (sala/cadeira/equipamento/box/consultório) | aba Unidades, etapa 3 | frontend validado (recurso criado no E2E) | E2E | — |
| Serviços CRUD (duração, buffer, preço `parseBRL` em centavos, recursos exigidos, agendável publicamente) | aba Serviços, etapa 5 | frontend validado | E2E + teste de valor em centavos no importador | — |
| Equipe (StaffUser com papel/unidades/vínculo) e Profissionais (jornada por unidade) | aba Equipe, etapa 5 | frontend validado (profissional com jornada no E2E) | E2E | — |
| Políticas com herança REDE → UNIDADE, “herdado da rede”/“sobrescrito”, restaurar padrão, grava só chaves sobrescritas | aba Políticas, etapas 6/8/9 | frontend validado (org_sorriso_u2) | `settings.test.ts` (herança) + E2E | — |
| Página pública, slug (`validateSlug`), domínio desejado como intenção | etapa 7 | frontend validado | E2E | domínio real: futuro |
| Comunicação: remetente/nome/Reply-To, WhatsApp, notificações — sem credenciais | etapa 8 | frontend implementado | — | Resend/Evolution: integração futura |
| Pagamentos: conta recebedora DEMONSTRATIVA, meios permitidos | etapa 9, aba Organização | frontend implementado | — | gateway: integração futura |
| Logo de documentos, dados bancários demo, templates (links), limites do plano (uso × `plans`), preferências | abas | frontend implementado | — | — |
| Marca: upload PNG/JPEG/WebP ≤ 2 MB, SVG rejeitado (“SVG requer sanitização no servidor — futuro”), dimensão mínima lida da imagem | `/marca` | frontend validado | E2E (SVG) | sanitização SVG: futuro |
| Recorte quadrado (canvas, zoom, teclado), símbolo separado, área segura 80 %, logo dark separado, fundo, iniciais | `/marca` | frontend implementado | — | — |
| Cor + `deriveBrandTokens`, tabela de contraste claro/escuro, alerta “não usamos texto branco sobre cor clara” | `/marca` | frontend validado (#FDE047 → texto navy) | `settings.test.ts` (contraste) + E2E | — |
| Salvar marca (`version++`) atualiza a interface imediatamente | `/marca` | frontend validado (`--q-primary` mudou no `<html>`) | E2E | — |
| Prévias desktop claro/escuro, celular, ícone any + maskable (círculo/squircle), splash | `/marca`, etapa 10 | frontend validado (screenshots) | — | — |
| Manifesto efetivo real `/t/<slug>/equipe|portal.webmanifest` (id, start_url, scope, ícones) e limitação para upload novo | `/marca` aba Prévias | frontend validado | E2E (id `/app/sorriso-pleno/`) | publicação dinâmica: backend futuro |
| Matriz de permissões, recurso+ação+unidade+vínculo, usuários por papel, visualizar como, flag × plano × permissão | `/permissoes` | frontend implementado (render validado) | — | autorização real: servidor/RLS |
| Auditoria com filtros (ator, ação, recurso, unidade, período) e CSV seguro | `/auditoria` | frontend implementado (render validado) | — | — |
| Relatórios: ocupação (jornada real), faltas/cancelamentos, por profissional/serviço, competência × recebido × disponível, inadimplência, ticket, estoque, propostas, CSV, período | `/relatorios` | frontend implementado (render validado) | — | — |
| Importador CSV: templates, auto/manual map, prévia, obrigatórios, CPF/data/número, duplicados (arquivo e base), relatório de erros, lote, desfazer, formula injection | `/importacao` | frontend validado | `settings.test.ts` + E2E (CSV inválido, desfazer) | XLSX: futuro |
| Seed: regra da rede + override `org_sorriso_u2` (cancelWindowHours 12, callPanelMode nome_abreviado); `importBatches` vazio | — | frontend validado | E2E | — |

## Limitações reais
- Permissões e escopos são de UI; a segurança real exige autorização no servidor e RLS.
- Imagens de marca ficam como data URL no armazenamento local (demo); não publicam ícones nem alteram app instalado. Só as clínicas seed têm manifesto/ícones reais (build).
- XLSX não é processado: a tela orienta salvar como CSV. Limite de 2000 linhas por arquivo.
- Desfazer importação mantém registros que já ganharam vínculos (agendamento/movimento de estoque) e informa a contagem.
- Relatório “disponível” usa `availableOn` do pagamento; estornos são abatidos integralmente do disponível.
- Gráficos são barras CSS/SVG simples, sem lib.
- Não validado em navegador: matriz/auditoria/relatórios com outros perfis (recepção/profissional `own`), dark mode das telas, Firefox/WebKit.

## Necessidades da fundação
- `FileUpload` não aceita `onFile` assíncrono tipado como Promise (funciona, mas tipo é `void`); validação de dimensões ficou no módulo.
- `Unit.overrides` (seed da fundação: `'agenda.cancelamentoHoras'`) é legado e ignorado; a herança oficial usa a coleção `settings`.
- `Badge` não aceita `style`/`className`.
