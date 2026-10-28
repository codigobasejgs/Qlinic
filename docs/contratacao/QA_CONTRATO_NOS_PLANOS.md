# QA: contrato dentro da escolha do plano (`/planos`)

Data: 28/10/2026. Esta correção substitui a página pública `/contrato` e a jornada `/contratar` do commit d405006.

## Causa do “em preparação”

`src/modules/contracts/public.tsx` testava `isConnectedEnv()`. Com qualquer sessão conectada ao Supabase, a página inteira de contratação era trocada pelo aviso “Contratação online em preparação”. O arquivo foi removido. No lugar, `src/modules/contracts/context.ts` (`useWho`) resolve estados explícitos:

| Estado | Comportamento |
|---|---|
| Demonstração (sem Supabase, sessão demo ou escolha explícita) | “Simular assinatura”, só com dados fictícios e selo fixo |
| Visitante | Preenche e revisa; para enviar, entra ou cria conta sem perder os dados |
| Conectado sem clínica | Solicitação vinculada à conta; a clínica é criada na ativação |
| Proprietário autorizado | Dados pré-preenchidos com a **própria** clínica; envia a solicitação |
| Conectado sem permissão (ex.: recepção) | Explicação específica e caminho até o proprietário; nenhum dado da clínica é carregado |

A autorização não depende da tela. A RPC `request_saas_contract` (migrações 0009/0010) exige `configuracoes.approve` na clínica, recalcula preço e limites a partir do catálogo, recusa total divergente e plano inativo, é idempotente e nunca grava “assinado”.

## Fluxo final

1. Em `/planos`, o botão “Assinar plano” seleciona o plano. A URL vira `/planos?plano=ID&ciclo=VALOR#contratacao` e a seção de contratação aparece logo abaixo dos cards. O foco vai para o título e a rolagem é suave, ou instantânea com `prefers-reduced-motion`.
2. A seção tem quatro blocos numerados, numa coluna de no máximo 920 px:
   1. **Plano escolhido**: total do ciclo, equivalente mensal rotulado como referência, desconto, preço após o desconto, limites e módulos do plano, ciclo, teste gratuito e “Alterar plano”.
   2. **Dados do contratante**: PJ ou PF, endereço, representante legal (não aparece para PF) e o cartão da contratada em somente leitura.
   3. **Seu contrato**: HTML integral atualizado enquanto o usuário digita. Campos vazios aparecem como “Informe … acima”, destacados.
   4. **Revisão e continuidade**: aceites separados e desmarcados, “Imprimir contrato”, “Baixar minuta” e a ação principal.
3. A ação principal depende do ambiente:
   - demonstração: “Simular assinatura”;
   - ambiente real sem provedor: “Enviar solicitação de contratação”, com o aviso de que não há contrato assinado;
   - com provedor habilitado: “Continuar para assinatura”.
4. O botão “Falar sobre esta contratação” só aparece se houver canal de WhatsApp autorizado no cadastro. Ele não envia documento nem assina nada.
5. Rotas antigas: `/contrato` redireciona para `/planos`, e `/contratar?plano=X` redireciona para `/planos?plano=X#contratacao`. Os parâmetros não comerciais (CPF, nome) são descartados. Nenhum callback de gateway, link de assinatura ou token usa essas rotas, conferido por busca no repositório.

**Fonte única de verdade.** O `useContractViewModel` junta catálogo, termos vigentes, modelo, contratada e partes, e alimenta o resumo, o HTML, a impressão, o download e o pedido. A cobrança simulada usa `offer.totalCents`, o mesmo valor. No ambiente real, o servidor recalcula o preço.

## Testes executados

| Suíte | Resultado |
|---|---|
| Typecheck (`tsc -b`) e lint (`eslint src`) | sem erros |
| Unitários (`vitest run`) | **265/265**, sendo 21 de contratação |
| E2E demonstração (`playwright test`, desktop e Pixel 7) | **40/40**, sendo 12 em `e2e/contracts.spec.ts` |
| RLS contra o Supabase real (`npm run db:test-rls`) | **56/56**, sendo 12 novas de contratação; sem resíduos |
| E2E conectado, contratação (`qa/connected-plans-e2e.mjs`, Supabase real) | **18/18**; sem resíduos |
| E2E conectado anterior (`qa/connected-e2e.mjs`) | **8/8** |

## Critérios de aceite

| # | Critério | Evidência | Status |
|---|---|---|---|
| 1 | Menu e rodapé sem “Contrato”; `/planos` acessível | E2E “menu e rodapé sem Contrato” | ✅ |
| 2 | Cada plano e ciclo abre a seção certa | E2E “cada plano e ciclo” (3 planos × 3 ciclos; foco no título; total igual ao card) | ✅ |
| 3 | Link direto válido funciona; inválido não contrata | E2E “link direto” (inválido: sem contrato e sem botão de ação) | ✅ |
| 4 | O que é digitado aparece no contrato sem perder foco | E2E: `pressSequentially`, foco mantido, rolagem com variação abaixo de 4 px; o texto aparece no contrato | ✅ |
| 5 | Trocar plano preserva o cadastro, atualiza valores e invalida o aceite | E2E “trocar plano” | ✅ |
| 6 | Contratada correta; nada da empresa de referência | E2E (nome, CNPJ e endereço exatos; sem “Qlinic Ltda” nem “Correspondência”) | ✅ |
| 7 | Conectado autorizado contrata sem janela anônima e sem “em preparação” | E2E conectado: proprietário, pré-preenchimento e envio | ✅ |
| 8 | Sem permissão: não acessa dados nem contrata | E2E conectado (recepção: UI bloqueada, RPC devolve 42501, leitura vazia) e E2E demo; RLS | ✅ |
| 9 | Sessão sem clínica e visitante entendem o fluxo | E2E conectado (visitante: prévia sem envio); estado “sem clínica” com mensagem própria | ✅ visitante; ⚠️ sem clínica só no código e na UI, sem E2E dedicado |
| 10 | Plano ativo não vira segunda assinatura | Unitário: aditivo, mesma quantidade de assinaturas, mesmo plano bloqueado; E2E do proprietário Vitta; RPC marca `kind=alteracao` | ✅ |
| 11 | Mesmo plano e valores no HTML, resumo, impressão/PDF e cobrança | E2E: total do resumo = linha do Anexo A = cobrança simulada; impressão usa as mesmas seções | ✅ |
| 12 | Checkbox ou WhatsApp não assinam | E2E: aceites marcados sem estado assinado; a RPC grava “solicitado”; o link do WhatsApp só abre conversa | ✅ |
| 13 | Rotas antigas redirecionam sem quebrar callbacks | E2E (`/contrato`, `/contratar` com PII descartada, voltar sem loop) | ✅ |
| 14 | Recarregar, voltar/avançar, duplo clique, plano desativado, sessão expirada | Duplo clique: 1 solicitação (E2E conectado) e 1 envelope (unitário/E2E); plano desativado: RPC recusa (RLS) e link mostra “indisponível”; sessão expirada: mensagem específica e dados mantidos (`remote.ts`); recarregar: demo mantém dados fictícios na aba, real avisa antes de sair (`beforeunload`) | ✅ (sessão expirada e recarga só por código e inspeção) |
| 15 | Mobile, tablet, desktop, claro/escuro, teclado, impressão | E2E 360/390/768 sem rolagem horizontal; tema escuro; impressão só com o contrato; prints | ✅ |
| 16 | Nada privado em URL, cache do PWA ou console | E2E (URL só com plano e ciclo; `caches` sem página de contratação; sem erros de console); conectado: CPF/CNPJ fora do localStorage/sessionStorage | ✅ |

## Prints

`qa/screenshots/contratacao-planos/`:
- 01–07: desktop (planos, cada bloco e a página inteira);
- 08–09: mobile a 360 e 390 px;
- 10: tablet a 768 px;
- 11: tema escuro;
- 12: plano inválido;
- 13: PDF A4 de impressão, com 13 páginas.

Para gerar de novo: `node qa/contract-shots.mjs`, com o `vite preview` rodando na porta 4173.

## Limitações reais

- **Produção não verificada daqui:** esta máquina não acessa `*.vercel.app`. Toda a validação foi feita no build local apontando para o Supabase real.
- **Fora da demonstração não há assinatura nem cobrança:** só a solicitação é registrada. Ainda falta implementar o painel interno para tratar as solicitações (`saas_contract_requests`).
- **CEP:** a consulta automática é simulada como indisponível, e o preenchimento é manual.
- **Rascunho no ambiente real:** não é salvo no navegador. Recarregar a página perde os dados, com aviso antes de sair. Rascunho autenticado no servidor ainda não existe.
- **Paginação “Página X de Y”** no PDF depende de suporte a `@page` margin boxes no navegador.
