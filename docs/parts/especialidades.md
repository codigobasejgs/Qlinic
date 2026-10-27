# Especialidades (veterinária, estética, psicologia, fisioterapia, nutrição, multidisciplinar)

Código: `src/modules/specialties/others/` — `pages.tsx` (exports fixos), `vet.tsx`, `aesthetics.tsx`, `psychology.tsx`, `physio.tsx`,
`nutrition.tsx`, `careplan.tsx`, `common.tsx` (helpers de UI), `lib.ts` (regras puras), `types.ts` (coleções privadas via declaration merging),
`seed.ts`, `styles.css`, `others.test.ts` (15 testes vitest).

Validação no navegador: Playwright em 1440 e 390 px (`qa/tmp/esp-shot.mjs`, `qa/tmp/esp-interact.mjs`; capturas `qa/tmp/esp-*.png`).
Perfis: org_vet owner/pro1/recepção, org_lumiere pro1, org_escuta pro1/pro2/recepção, org_movimento pro1, org_nutri pro1, org_vitta pro2.
Sem `pageerror`/erros de console; sem rolagem horizontal da página em nenhuma aba.

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Tutor → vários animais; pagador separado | /veterinaria · Tutor e animal | frontend validado | — | — |
| Ficha do animal (espécie, raça, sexo, idade/estimada, pelagem, microchip) | /veterinaria · Tutor e animal | frontend validado | — | — |
| Peso com histórico, gráfico SVG e nova pesagem | /veterinaria · Tutor e animal | frontend validado | — | — |
| Carteira de vacinação/vermifugação por animal, retorno manual, sem reforço universal | /veterinaria · Vacinas | frontend validado (Thor × Luna sem interseção) | isolamento por animal; validação de retorno | — |
| Internação: mapa de boxes, admissão, evolução, prescrição digitada, tarefas por horário | /veterinaria · Internação | frontend validado | geração de tarefas | — |
| Registro de administração; agendado × administrado × atrasado × não administrado (motivo) × suspenso; alta | /veterinaria · Internação | frontend validado (registro de atrasada → administrada) | estados, suspensão, alta | — |
| Banho/tosa: serviços, agenda do dia, observações, autorização do tutor (histórico), entrega | /veterinaria · Banho e tosa | frontend validado | — | — |
| Calculadora de conversão (espécie/contexto, unidades, incompatível, ausente, ≤0, copiar) | /veterinaria · Calculadora | frontend validado (6,4 mL; erro UI×mg/mL) | 7 casos | — |
| Mapa facial/corporal SVG clicável + teclado + lista | /estetica · Mapa | frontend validado | — | — |
| Aplicação (produto, U/mL, lote, profissional, obs.) e histórico por sessão | /estetica · Mapa | frontend validado | — | — |
| Pacotes: previstas × realizadas, validade, alerta de expiração, registrar sessão | /estetica · Pacotes | frontend implementado | expiração/conclusão | — |
| Comparador antes/depois (ilustração fictícia) + alinhamento x/y | /estetica · Antes e depois | frontend validado | — | — |
| Consentimento por finalidade; divulgação bloqueada sem consentimento publicitário | /estetica · Antes e depois | frontend validado (botão desabilitado) | — | — |
| Agenda recorrente (série semanal via `createAppointment` + `weeklyRecurrence`, conflitos ignoram e reportam) | /psicologia · Agenda | frontend implementado (lista validada; criação não exercitada no navegador) | — | — |
| Plano de acompanhamento (objetivos, frequência, revisão, histórico) | /psicologia · Plano | frontend validado | — | — |
| Registros restritos (`clinicalRepo.save`, `canSeeRecord`), adendo | /psicologia · Registros | frontend validado (recepção vê só "conteúdo restrito") | — | — |
| Portal só com documentos liberados; restrito não liberável | /psicologia · Documentos | frontend implementado | — | Portal (outro agente) lê `releasedToPortal` |
| Responsável legal: agenda/financeiro sim, sessão não por padrão; decisão com motivo | /psicologia · Responsável legal | frontend validado (org_escuta_pat5) | — | — |
| Avaliação funcional (dor 0–10, ADM, força 0–5, testes) com comparação à anterior | /fisioterapia · Avaliação | frontend validado | — | — |
| Metas SMART com status | /fisioterapia · Metas | frontend implementado | — | — |
| Plano de sessões (realizadas = agendamentos concluídos), evolução por sessão | /fisioterapia · Sessões | frontend implementado | — | — |
| Prescrição de exercícios (ExercisePlan), mídia placeholder rotulada, liberação ao portal | /fisioterapia · Exercícios | frontend validado | — | Portal lê `exercisePlans` |
| Adesão declarada exibida como declarada | /fisioterapia · Exercícios | frontend validado | — | Portal grava `adherence` |
| Relatório imprimível (DemoPaper) | /fisioterapia · Relatório | frontend implementado | — | — |
| Anamnese alimentar estruturada (versionada por registro) | /nutricao · Anamnese | frontend implementado | — | — |
| Medidas + tabela de diferenças entre avaliações | /nutricao · Medidas | frontend validado | diferenças | — |
| Plano alimentar versionado: edição → revisado → liberar (substitui anterior) | /nutricao · Plano | frontend validado (v2 liberada) | — | Portal lê `nutritionPlans` |
| Plano de cuidado: participantes do mesmo tenant, acesso por seção, liberação ao paciente | /multidisciplinar · Seções/Participantes | frontend validado (org_vitta, org_movimento) | — | — |
| Encaminhamentos internos (enviado → aceito/recusado → concluído) e tarefas com responsável/prazo | /multidisciplinar · Encaminhamentos/Tarefas | frontend implementado | — | — |

## Permissões aplicadas
- Conteúdo clínico: `t.scope('clinical')`; recepção vê só Banho e tosa (vet) e Pacotes (estética); demais abas mostram estado explicativo.
- Escrita clínica exige `can('clinical','create')` + vínculo profissional. Owner (clinical: read) fica em somente leitura com aviso.
- Psicologia: `clinical_restricted`; conteúdo de sessão só para o autor via `canSeeRecord`. Auditoria não registra texto de sessão.
- Auxiliar pode registrar administração de internação.

## Limitações reais
- "Atrasado" é derivado (agendado + 30 min de tolerância), recalculado por minuto no cliente; servidor deverá ter relógio confiável.
- Seeds de banhos de hoje e séries de psicologia são inseridos em `appointments` de forma adiada (`setTimeout` no seed) e idempotente por ID;
  se não houver horário/recurso livre, a ocorrência é omitida.
- Comparador usa apenas ilustrações SVG fictícias; upload de foto real não existe por decisão de escopo.
- Suspensão de série cancela ocorrências futuras uma a uma via `changeAppointmentStatus` (gera notificações simuladas por ocorrência).
- Sem concorrência/transação: duas abas podem registrar a mesma tarefa (o segundo registro é recusado só na mesma aba).

## Necessidades da fundação
- `useTenant().can` não tem noção de papel "auxiliar" para internação; usei `effectiveUser.memberships` (sugestão: recurso `internacao` na matriz).
- `ImageCompare` não expõe consentimento nem `aria-describedby`; o rótulo do slider usa o título como id (`cmp-${label}`) — títulos com espaço geram id com espaço.
- `dental/OdontologyPage.tsx` tem erro TS6133 (`Timeline` não usado) — fora do meu escopo.
