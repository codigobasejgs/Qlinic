# Design system Qlinic (aplicação)

Fonte oficial: `design-system/tokens.json` e `design-system/qlinic.css` (importado por `src/styles/app.css` — não duplicado).
Identidade: `docs/IDENTIDADE_VISUAL.md`, `docs/Qlinic_Manual_de_Identidade.pdf`, SVGs em `public/brand/svg`.
Vitrine viva: rota `/demonstracao/identidade` (fora do menu do paciente).

## Marca
- `QlinicLogo` (`src/ui/brand.tsx`): variantes `horizontal | vertical | simbolo`, tons `auto | principal | reverso | branco | monocromatico`,
  altura → largura proporcional ao viewBox oficial (374×105, 241×215, 100×100). `<img>` com `alt="Qlinic"` ou `decorative` (`alt=""`) quando há texto
  equivalente ao lado. Nunca recriado com fonte do navegador. `auto` = principal no light, reverso no dark (ou `onDark` na sidebar navy).
- Onde aparece: site comercial, autenticação, Super Admin, rodapé discreto “plataforma Qlinic” na equipe e fallback de marca.
- `ClinicLogo`: logo enviado pela clínica ou fallback de iniciais sobre a cor derivada. A marca da clínica prevalece nos ambientes dela; o logo Qlinic não é recolorido.
- Imagens “fundo claro/escuro” de `public/brand/png` são para download; header/sidebar usam o SVG transparente.

## Tokens
Semânticos `--q-*` em light e dark completos (fundo, superfície, texto, borda, input, ação, foco, sucesso, alerta, erro, info) do pacote, mais
derivados da aplicação: `--q-primary-soft`, `--q-primary-text`, `--q-sidebar*`, `--q-overlay`, `--q-shadow*`, `--q-demo-*`, `--q-neutral*`.
Tema por `data-theme` no `<html>` (claro, escuro, sistema), aplicado antes do primeiro paint.
Espaço 4/8 (`--q-s1..s8`), raios input 10 / card 16 / diálogo 20, movimento 120/180/240 ms, `prefers-reduced-motion` respeitado.
Tipografia: Inter se instalada, fallback `system-ui` — nenhuma fonte externa carregada. Escala 12/14/16/20/24/32/48/64. Inputs 16 px no celular (sem zoom do iOS).

## White-label
`deriveBrandTokens(cor, modo)` (`src/lib/color.ts`) gera `primary`, `onPrimary`, `hover`, `soft`, `primaryText`, `focus` com contraste ≥ 4,5:1
(foco ≥ 3:1). Cor clara nunca recebe texto branco: troca para navy ou escurece a cor. Cores de status **não** mudam com a marca.
`useTenantBrand(org)` aplica os tokens da clínica enquanto o ambiente dela está montado e restaura os da Qlinic ao sair.

## Componentes (`src/ui`)
Button/ButtonLink, Field (label visível + `aria-describedby` de dica/erro + `aria-invalid`), Input com máscara, Select, Textarea, Checkbox, Segmented,
Combobox (ARIA 1.2), Tabs (setas/Home/End), Dialog/Drawer (foco preso, Esc, foco restaurado; folha inferior no celular), confirmação com motivo
obrigatório, toasts `aria-live`, CommandPalette (Ctrl K), DataTable (ordenação, seleção de colunas, exportação CSV segura, vira cartões < 768 px),
Pagination, Alert, Badge/SimBadge, Kpi, Timeline, EmptyState/ErrorState/Skeleton, Breadcrumbs, Progress, FileUpload (tipo/tamanho/progresso/falha),
SignaturePad (desenho ou nome digitado), ImageCompare (slider nativo), DocumentEditor (texto puro + variáveis), ZoomPan (zoom/pan interno por botões,
teclado e ponteiro), DemoPaper (marca d’água), calendário/mês/kanban por classes CSS.

## Layout
Desktop: sidebar recolhível (navy), topbar com seletor de unidade, busca, rede, instalar, notificações, tema, usuário. Tablet (< 1024): sidebar vira drawer.
Celular (< 768): barra inferior com tarefas prioritárias + “Mais” (drawer de tela inteira com todas as áreas) — nada essencial escondido.
Sem rolagem horizontal da página: tabelas viram lista, grades/mapas rolam/zoom dentro do componente.

## Acessibilidade (objetivo WCAG 2.2 AA — sem alegação de certificação)
Skip link, landmarks, foco visível 3 px com offset, alvos ≥ 44 px (36 px em ponteiro fino, 44 px em `pointer: coarse`), labels sempre visíveis,
erros em texto com ícone, contraste dos pares registrados em `docs/contraste.json` revalidado em teste (`src/lib/foundation.test.ts`),
alternativa por teclado/formulário a todo arrastar, `aria-live` para mudanças assíncronas. Resultados medidos em `QA_REPORT.md`.

## Conteúdo
Tom claro e humano (“Consulta confirmada”, “Revisar pagamento”). Fluxo simulado sempre com selo “Simulado — sem envio/cobrança real”.
Sem promessas clínicas, de resultado, de economia ou de conformidade.
