# Deploy — GitHub, Vercel e (futuro) Cloudflare

> Nesta etapa não houve publicação: nenhum repositório remoto nem projeto Vercel foi indicado/autorizado. Abaixo, comandos exatos.

## Build local
```bash
npm ci
npm run icons        # regenera manifestos/ícones PWA por clínica (requer Chromium do Playwright: npx playwright install chromium)
npm run typecheck && npm run lint && npm test
npm run build        # dist/ (tsc -b + vite build; versiona sw.js e gera asset-manifest.json)
npm run preview      # http://localhost:4173
```

## GitHub
```bash
git init -b main               # já feito localmente se este README estiver versionado
git add -A && git commit -m "feat: frontend de demonstração Qlinic"
git remote add origin https://github.com/<conta>/<repositorio>.git   # destino a definir
git push -u origin main
```

## Vercel (demonstração)
```bash
npm i -g vercel
vercel link            # escolher/criar projeto (destino a definir)
vercel                 # preview
vercel --prod          # produção da demonstração
```
`vercel.json` já define build `npm run build`, saída `dist`, rewrite SPA (deep links e recarregamento direto) exceto `assets/`, `brand/`, `t/`, `sw.js`,
`offline.html`, `robots.txt`, e cabeçalhos (`sw.js`/manifestos `no-cache`, assets `immutable`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).
Variáveis: nenhuma obrigatória. Não configurar segredos com prefixo `VITE_` (são públicos no bundle).
Previews por PR via integração GitHub da Vercel. Rollback: `vercel rollback <deployment-url>` ou “Promote” de um deploy anterior no painel.

## Domínios (futuro — não executado)
- Domínio comercial raiz (ex.: `qlinic.exemplo` — **nome/domínio não adquiridos**), subdomínios por tenant (`<slug>.<raiz>`), domínio próprio opcional.
- Validação de propriedade do domínio do cliente, mapeamento hostname → tenant no servidor, TLS automático, redirecionamento para o canônico,
  origens confiáveis, cookies host-only, recuperação de domínio removido (volta ao subdomínio padrão). Tenant desconhecido → erro seguro.
- Verificar na documentação vigente da Vercel o suporte a wildcard (`*.<raiz>`), custom domains e certificados antes de definir registros.
  **Não há CNAME/TXT universais**: os valores vêm do provedor no momento da configuração.

## Cloudflare (futuro)
DNS e proteções conforme configuração validada. **Não** aplicar “cache everything” a HTML autenticado, APIs, manifestos por tenant ou portal.
Se usar proxy na frente da Vercel, conferir compatibilidade de certificados/validação de domínio e desabilitar cache de `sw.js`.
