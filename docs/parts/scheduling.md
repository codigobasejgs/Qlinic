# Módulo Agenda, Recepção e Chegada (`src/modules/scheduling`)

Arquivos: `pages.tsx` (re-exporta), `home.tsx`, `agenda.tsx`, `apptForm.tsx`, `reception.tsx`, `waitlist.tsx`, `kiosk.tsx` (totem + painel),
`qr.tsx` + `qrcode.ts` (encoder QR), `effects.ts` (coleção `freedSlots` + seed), `lib.ts`, `styles.css`, testes `scheduling.test.ts`, `qr.test.ts`.

Validação no navegador: Playwright em 1440 e 390 px (`qa/tmp/scheduling-shot.mjs`, imagens `qa/tmp/scheduling-*.png`) e fluxos
ponta a ponta (`qa/tmp/scheduling-flow.mjs`, saída `qa/tmp/scheduling-flow.txt`), sem erros de console nem rolagem horizontal.

| Requisito | Rota/Tela | Status | Teste | Dependência externa |
|---|---|---|---|---|
| Painel do dia por perfil (recepção: fila/chegadas; profissional: seus atendimentos + "Iniciar atendimento" → `/atendimento/:id`; gestão: ocupação, faltas, recebido hoje, pendências) respeitando unidade | `/app/:slug` | frontend validado (owner null/u1, profissional) | screenshots `home-*` | — |
| Visões dia/semana/mês/lista; filtros profissional, recurso, unidade, procedimento; colunas por profissional/recurso | `/agenda` | frontend validado | screenshots `agenda-*` | — |
| Grade no fuso da unidade, linha de agora, fechado hachurado (horário, especial, feriado), ausências e bloqueios | `/agenda` | frontend validado | `scheduling.test.ts` (regras) | — |
| Criar (slot, botão, `?novo=1`, chip de disponibilidade), editar, reagendar com motivo, cancelar com motivo | `/agenda` | frontend validado | fluxo e2e passos 4–5 | — |
| Mover: arrastar (HTML5) abre formulário pré-preenchido; alternativa "Editar / reagendar" | `/agenda` | frontend implementado (arraste não exercitado no script) | — | — |
| Recorrência semanal (n ocorrências, a cada k semanas, `seriesId`) e edição de série (só esta / esta e seguintes, revalidando cada uma) | `/agenda` | frontend validado (criação de série); edição "esta e seguintes" implementada | fluxo e2e passo 4 | — |
| Todos os conflitos em texto; encaixe só com `agenda:approve` + confirmação → `acknowledgeConflicts` | `/agenda` | frontend validado | `scheduling.test.ts` + screenshot `flow-conflito` | Transação no servidor |
| Disponibilidade calculada (`availableSlots`) por serviço + dia | `/agenda` | frontend validado | `scheduling.test.ts` | — |
| Detalhe: transições válidas (`TRANSITIONS`), histórico, status financeiro separado, token de check-in com QR + código + expiração | drawer na agenda/recepção | frontend validado | screenshot `flow-qr` | — |
| Profissional `own` só altera os seus | `/agenda` | frontend implementado | — | Autorização no servidor/RLS |
| Recepção: busca nome/CPF/telefone, cadastro progressivo, sugestão de duplicidade (sem merge) | `/recepcao` | frontend implementado (busca/cadastro não exercitados no script) | — | — |
| Fila do dia com tempos, chegada manual (senha R###), chamar paciente | `/recepcao` | frontend validado | fluxo e2e passo 3 | — |
| Documentos pendentes (marcar recebido) | `/recepcao` | frontend implementado | — | — |
| Caixa por unidade/operador + `receiveAtDesk` com métodos da política | `/recepcao` | frontend validado | fluxo e2e passo 7 | Gateway/conciliação (futuro) |
| Alertas clínicos só via `visibleClinicalAlerts` (recepção não vê) | recepção/detalhe | frontend validado (escuta recepção sem alertas; owner vê) | screenshots | — |
| Lista de espera: disponibilidade, duração, prioridade; adicionar/remover | `/lista-espera` | frontend implementado | screenshot `espera-*` | — |
| Vagas liberadas (`freedSlots`) → `matchWaitlist` → `offerSlot` com contagem regressiva; disputa de 2 aceites (`acceptOffer`, 2º recebe erro); expirar ofertas | `/lista-espera` | frontend validado | fluxo e2e passo 6 | Reserva definitiva: transação no servidor |
| Totem: check-in por token, só senha + primeiro nome, sem lista, reinício 10 s e botão, teclado grande | `/c/:slug/totem` | frontend validado (inclui recusa de reuso) | fluxo e2e passo 2 | — |
| Painel de chamada: senha ou `abbreviateName` conforme política, últimas chamadas, storage + polling 3 s, sem dado clínico | `/c/:slug/painel` | frontend validado | fluxo e2e passo 3 | Push/realtime (futuro) |
| QR Code real em TS puro (byte, ECC M, v1–6, máscara, Reed–Solomon) → SVG | `qr.tsx` | frontend validado | `qr.test.ts` (matriz, finders, timing, vetor RS ISO, **decodificação OpenCV**) | — |
| `on('appointment.cancelled')` registra vaga futura em `freedSlots` (sem oferta automática) | `effects.ts` | frontend validado | fluxo e2e passo 5 (vaga aparece) | — |

## Limitações reais
- Concorrência é simulada localmente: a "disputa" reproduz o segundo pedido chegando após o primeiro; reserva definitiva exige transação/constraint no servidor.
- QR limitado a 106 bytes (v6/M) — suficiente para o token; conteúdo maior lança erro (ponytail no código).
- Teste de decodificação do QR usa `python` + `cv2` se disponíveis (neste ambiente: sim, passou); sem OpenCV o teste apenas avisa.
- Arraste HTML5 não funciona em toque (mobile usa lista do dia + formulário "Reagendar", que é a alternativa obrigatória).
- Visão semana sem filtro de profissional agrega todos numa coluna por dia (faixas lado a lado); para detalhe, filtrar profissional.
- Semana/mês/grade usam o fuso da unidade selecionada (ou da primeira permitida quando "todas"); unidades com fusos diferentes exigiriam grade por unidade.
- Senha do totem (`A###`) é calculada em `checkInWithToken` por data UTC (`start.slice(0,10)`), podendo divergir do dia civil local perto da meia-noite.

## Necessidades da fundação
- `checkInWithToken` (src/domain/appointments.ts): contar senhas do dia pelo fuso da unidade, não por `start.slice(0,10)` (UTC).
- `changeAppointmentStatus`: a condição de motivo tem lógica redundante (`(cancelada || faltou) && ... && cancelada`); faltou não exige motivo — confirmar se é intencional.
- `callPatient` não grava trilha/auditoria nem atribui senha; o módulo atribui senha `R###` localmente (`assignDeskTicket` em `lib.ts`). Ideal: senha única por unidade/dia no domínio.
- `expireOffers` não conhece `freedSlots`; a página da lista de espera devolve a vaga a "livre" quando não há oferta ativa (só enquanto aberta).
- Tipo `Appointment.checkIn.token` obrigatório impede registrar senha sem token; sugerido `token?: string`.
