# Qlinic — Identidade visual 1.0

## Comece aqui
- `svg/qlinic-logo-principal.svg`: logo horizontal para fundos claros.
- `svg/qlinic-logo-reverso.svg`: símbolo mint e nome branco para fundo escuro.
- `svg/qlinic-logo-branco.svg`: versão inteiramente branca.
- `svg/qlinic-logo-monocromatico.svg` e `preto`: reprodução em uma cor.
- `svg/qlinic-logo-vertical*.svg`: assinatura empilhada.
- `svg/qlinic-simbolo-*.svg`: símbolo isolado.
- `Qlinic_Manual_de_Identidade.pdf`: manual de 8 páginas.
- `design-system/`: CSS, JSON e exemplos para aplicação.
- `pwa/`: ícones prontos e manifesto exemplificativo.
- `png/`: logos transparentes em alta resolução e avatar.

## Direção
Q geométrico aberto, curvas acolhedoras, assinatura sóbria. Verde-petróleo #0D9488,
azul profundo #102A43, verde-água #5EEAD4, branco #F7FAFC e cinza #64748B.
Botão claro: #087F75 + branco. Botão dark: #5EEAD4 + #102A43.
Slogan proposto: Sua clínica conectada ao cuidado.

## Implementação
Copiar ativos para `/public/brand/` ou diretório equivalente. Usar SVG por `<img>`
com `alt="Qlinic"`, largura e altura preservadas. Nas áreas com texto adjacente
equivalente, considerar `alt=""` para evitar repetição. Logos são vetoriais,
com nome em curvas, sem fonte externa ou imagem embutida. Não usar captura PNG
em lugar do SVG quando o ambiente aceitar SVG. Não distorcer proporções.

O wordmark foi convertido em contornos a partir de Nimbus Sans Regular;
nenhum arquivo de fonte é redistribuído. A tipografia de interface proposta é Inter,
não embutida neste pacote. O CSS usa fallback de sistema se ela não estiver instalada.
O manual usa DejaVu Sans. O símbolo foi construído geometricamente em SVG.

PWA: `manifest.example.webmanifest` é EXEMPLO da marca-mãe. Ajustar id/start_url/scope,
nomes e URLs para cada aplicação. Publicar os ícones nos caminhos correspondentes.
Não usar o mesmo id de instalação para todos os clientes. O pacote não cria backend,
service worker, HTTPS, push ou instalação por si só. Não adicionar cantos arredondados
ao arquivo maskable; o sistema aplica a máscara. Avatar já arredondado é outra aplicação.

## UI/UX
Uma ação principal por contexto. Grade 8 px. Conteúdo com respiro, sem excesso de cards.
Labels sempre visíveis, placeholder não substitui label. Estado de erro com texto.
Foco com outline e offset. Formulários 16 px no mobile. Botões mínimo 44 px.
Tabela comparativa no desktop; listas e cartões contextualizados no celular.
Tipografia 12/14/16/20/24/32/48/64. Não usar caixa alta em textos longos.
Raio de input 10, card 16, modal 20. Sombra discreta apenas para elevação relevante.
Ícones de uma família consistente: traço 1,75–2 px, 20/24 px, rótulo nas ações críticas.
Transições 120–240 ms. Respeitar redução de movimento. Dark é tema semântico completo.

## White-label
Qlinic é marca da plataforma; clínicas mantêm identidade própria. Seus tokens não
devem alterar cores semânticas de risco/erro/sucesso. Validar contraste após qualquer
personalização. Não permitir texto branco sobre cor clara selecionada pelo cliente.
Logo horizontal e símbolo do app podem ser arquivos diferentes. Área livre 25% da
altura do símbolo. Logo horizontal mínimo 128 px; símbolo mínimo 24 px, exceto favicon.

## Conteúdo e tom
Claro, humano e objetivo. “Consulta confirmada”, “Salvar alterações”, “Revisar pagamento”.
Evitar “Sucesso!” genérico, jargão técnico para pacientes e promessas clínicas.
Dados nas aplicações visuais são fictícios. A interface mostrada é referência, não app.

## Validação
SVG XML validado. Logos não contêm <text>, <image> ou scripts. Transparência conferida.
Pares de texto semânticos light/dark calculados em docs/contraste.json.
Manual revisado visualmente. Isso não certifica toda uma futura aplicação em WCAG.
O nome e símbolo exigem análise de disponibilidade antes de registro definitivo.
