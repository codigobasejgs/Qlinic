# Odontologia, Medicina ambulatorial e Convênios

Escopo: `src/modules/specialties/dental/**` — `pages.tsx` (exports `OdontologyPage`, `MedicinePage`, `InsurancePage`), `OdontologyPage.tsx`, `Odontogram.tsx`, `DentalTabs.tsx`, `MedicinePage.tsx`, `InsurancePage.tsx`, `common.tsx`, regras puras `odonto.ts` / `medicine.ts`, tipos `types.ts`, `seed.ts`, `styles.css`, testes `dental.test.ts` (19 testes).

Legenda de status: **frontend validado** = ação executada no navegador (Playwright, `qa/tmp/dental-flow.mjs`); **frontend implementado** = tela renderizada e revisada em screenshot, ação coberta por teste unitário mas não clicada no navegador.

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Odontograma 2D SVG: permanente (11–48), decídua (51–85), mista; vista frontal 18→11 \| 21→28 | `/odontologia` › Odontograma | frontend validado | FDI, quadrantes, mista | — |
| 5 faces por dente (V, L/P, M, D, O/I), mesial voltada à linha média, rótulos por dente | idem | frontend validado | faces | — |
| Teclado: setas entre dentes, Enter/Espaço seleciona; faces com `aria-label` "Dente 16, face oclusal" | idem | frontend validado (ArrowRight + Enter + face) | `moveInRows` | — |
| Marcação condição/procedimento com data/autor, existente × planejado × realizado (cor + hachura/pontilhado/X), histórico, anulação com motivo | idem | frontend validado (planejado 17 O) | `validateEntry` | — |
| Mobile: ZoomPan + "Ir para o dente" + chips de dentes marcados; sem rolagem horizontal | idem 390 px | frontend validado (scrollWidth 390) | — | — |
| Plano: marcação planejada cria `TreatmentItem` (origin odontograma, dente, faces, serviço, preço) | `/odontologia` › Plano e orçamento | frontend validado | — | — |
| "Gerar orçamento": `Proposal` via `saveProposal`, número sequencial, token `demo-…`, validade, `maxInstallments` da política, grupos de alternativas → `/orcamentos/:id` | idem | frontend validado (ORC-0002 aberto no editor comercial) | — | módulo comercial |
| Status dos itens após aceite (aprovado/recusado) | idem | frontend implementado | — | `acceptProposal` (fundação) |
| Seed: dentes 16, 26, 36 batem com `org_sorriso_ti1..4` / `org_sorriso_prop1` | seed | frontend validado (visível no odontograma) | — | seed núcleo |
| Periodontograma 6 sítios, PS 0–15, recessão −5..15, sangramento, supuração, mobilidade 0–3, furca 0–3 (só multirradiculares) | `/odontologia` › Periodontograma | frontend implementado | validações estruturais | — |
| NIC = PS + recessão, % sangramento, sítios ≥4/≥6 mm, comparação entre 2 exames | idem | frontend implementado | NIC, resumo | — |
| Ortodontia: manutenções previstas/realizadas/faltou; alinhador placa n de N, trocas, entrega sequencial | `/odontologia` › Ortodontia | frontend implementado | — | — |
| Laboratório: solicitado → enviado → recebido → ajuste → entregue (+cancelado), histórico, custo, prazo, atraso, vínculo ao `TreatmentItem` | `/odontologia` › Próteses/laboratório | frontend implementado (atraso visível no seed) | transições, motivo, atraso | — |
| Imagens: upload demonstrativo → `files` (imagem_intraoral/radiografia), galeria por data/dente, card do adaptador futuro | `/odontologia` › Imagens | frontend implementado | — | agente/SDK de captura, storage privado |
| Esterilização: ciclos por equipamento do tenant, indicadores informados, responsável, validade, vínculo kit ↔ agendamento; sem conformidade automática | `/odontologia` › Esterilização | frontend implementado | `releaseBlockers` | — |
| SOAP configurável → `clinicalRepo.save` (specialty `medicina`), rascunho/finalizar, adendo | `/medicina` › Evolução SOAP | frontend validado (rascunho salvo) | — | — |
| Sinais vitais + IMC com faixa informativa; faixas plausíveis | `/medicina` › Sinais vitais | frontend validado (IMC 22,9; SpO₂ 120 rejeitado) | IMC, vitais | — |
| Exames solicitado → coletado → recebido + anexo demonstrativo | `/medicina` › Exames | frontend implementado | — | — |
| Encaminhamentos (diretório, motivo, prioridade operacional) | `/medicina` › Encaminhamentos | frontend implementado | — | — |
| Retornos: lembrete ou `createAppointment` | `/medicina` › Retornos | lembrete: frontend validado; agendamento: frontend implementado | — | agenda (fundação) |
| Receitas/atestados sempre rascunho (`DemoPaper`), sem sugestão de medicamento/dose | `/medicina` › Receitas e atestados | frontend implementado | — | assinatura ICP-Brasil (futuro) |
| Diretório de especialidades e templates SOAP versionados | `/medicina` › Diretório e templates | frontend implementado | — | — |
| Pediatria: medidas + gráfico SVG "curva de EXEMPLO sem percentis" | `/medicina` › Pediatria (`org_vitta_pat5`) | frontend implementado (render revisado) | crescimento (validação) | referência validada OMS/MS (futuro) |
| Carteirinhas + elegibilidade SIMULADA determinística (elegível, carência, carteira inválida, vencida) | `/convenios` › Carteirinhas | frontend validado ("Elegível") | elegibilidade | webservice operadora (futuro) |
| Autorizações solicitada/autorizada/negada | `/convenios` › Autorizações | frontend implementado | — | idem |
| Guias consulta/SP-SADT vinculadas a atendimento concluído | `/convenios` › Guias | frontend implementado | — | — |
| Lotes abrir/fechar/enviar simulado/processado | `/convenios` › Lotes | frontend implementado | `transitionBatch` | — |
| Glosa, recurso, conciliação faturado × pago × glosado | `/convenios` › Glosas e conciliação | frontend implementado (seed com glosa) | glosa/recurso/conciliação | — |
| "Gerar artefato TISS demonstrativo" XML/JSON marcado no nome e no conteúdo | `/convenios` › Lotes | frontend validado (download `ARTEFATO-TISS-DEMONSTRATIVO-NAO-HOMOLOGADO_LOTE-DEMO-0001.xml`, conteúdo marcado) | artefato | TISS/TUSS ANS (integração versionada futura) |
| Permissões: `clinical` (all/own), `orcamentos`, `financeiro`/`recepcao`; paciente fora da unidade → estado explicativo | todas | pro1 escopo próprio: frontend validado; owner/recepção somente leitura: frontend implementado | — | — |

## Limitações reais
- Odontograma 3D não implementado (extensão opcional, flag `odontograma.3d` desligada).
- Imagens e anexos ficam como data URL no `localStorage` (limite de poucos MB); sem DICOM.
- Elegibilidade/autorização/retorno da operadora são simulados e registrados manualmente.
- Artefato TISS é estrutura própria `qlinic-demo-0`, não o schema ANS.
- Curva pediátrica liga apenas os pontos do paciente; nenhum percentil.
- Escopo "own" do profissional filtra marcações/exames/casos por `professionalId`; itens sem profissional não aparecem para o perfil profissional.
- Template SOAP: só a versão atual é guardada (registros mantêm `templateVersion`).

## Necessidades da fundação
- Storage privado de arquivos com links temporários (substituir data URL).
- Transação atômica para orçamento ↔ `TreatmentItem` ↔ odontograma (hoje sequencial no store).
- Evento de domínio `proposal.accepted` já existe; nenhum efeito deste módulo depende dele no momento.
