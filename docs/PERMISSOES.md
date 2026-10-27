# Permissões (demonstrativas)

> A matriz organiza a interface da demonstração. **Não é segurança.** Em produção a autorização é verificada no servidor e por RLS
> (ver `BACKEND_SUPABASE.md`). Fonte: `src/domain/permissions.ts`; tela: `/app/:slug/permissoes` (matriz + “visualizar como perfil”).

## Modelo
`permitido = papel(membership) × recurso × ação × unidade × vínculo`
- **Unidade**: membership com `unitIds: 'all'` ou lista; ação em unidade fora da lista é negada.
- **Vínculo** (`'own'`): só registros do próprio profissional (`ownerProfessionalId === professionalId`).
- **Feature flag / módulo** (`organization.modules`), **limite do plano** (`plans.limits`) e **permissão** são independentes: módulo habilitado não concede acesso.

Ações: `read, create, update, delete, approve, export`. Legenda: ✔ total · P = próprios · — negado.

| Recurso | Proprietário | Gestor rede | Gestor unidade | Recepção | Profissional | Auxiliar | Financeiro | Estoque |
|---|---|---|---|---|---|---|---|---|
| agenda | ✔ | ✔ | ✔ | ✔ | ler; alterar P | ler | — | — |
| recepção | ✔ | ✔ | ✔ | ✔ | ler | ler | — | — |
| pacientes (cadastro) | ✔ | ler/criar/alterar | ler/criar/alterar | ler/criar/alterar | ler/alterar | ler | ler | — |
| clinical (prontuário) | **ler** | — | — | **—** | ler/alterar/finalizar P; criar | ler | — | — |
| clinical_restricted (psicologia) | **—** | — | — | **—** | P | — | — | — |
| documentos | ler/criar | ler | ler | ler | ler/criar; alterar P | ler | — | — |
| arquivos | ler | — | — | — | ler/criar/alterar | ler/criar/alterar | — | — |
| orçamentos / CRM | ✔ | ✔ | ler/criar/alterar | ler/criar; CRM alterar | ler/criar/alterar | — | orçamentos ler | — |
| financeiro / caixa | ✔ | alterar/aprovar/exportar | ler/criar/alterar | ler/criar; caixa alterar | — | — | ✔ | — |
| comissões | ✔ | ler/aprovar | ler | — | ler P | — | ✔ | — |
| estoque / compras | ✔ | ✔ | alterar; compras aprovar | — | estoque ler | estoque ler/alterar | compras ler/aprovar | ✔ / alterar |
| configurações / equipe / marca | ✔ | alterar | ler/alterar | — | — | — | — | — |
| integrações | ✔ | ler | — | — | — | — | ler | — |
| auditoria | ler/exportar | ler | ler | — | — | — | — | — |

Decisões explícitas:
- Recepção **não** vê alertas clínicos nem conteúdo de sessão (`visibleClinicalAlerts`, `canSeeRecord`).
- Psicologia (`confidentiality: 'restrito'`): só o profissional autor; proprietário não lê conteúdo por padrão.
- Proprietário lê prontuário padrão (gestão), mas não altera registro de outro profissional.

## Plataforma (Super Admin)
| Área | Proprietário plataforma | Financeiro SaaS | Suporte SaaS |
|---|---|---|---|
| dashboard, contratantes | ✔ | ✔ | ✔ |
| planos, assinaturas, cobrança, custos | ✔ | ✔ | — |
| testes | ✔ | — | — |
| integrações, domínios, operação | ✔ | — | ✔ |
| suporte | ✔ | — | ✔ |
| governança | ✔ | — | — |

Suporte **nunca** recebe leitura automática de prontuários. **Acesso assistido** (tela Suporte): motivo + escopo + prazo → autorização da clínica →
indicação visível + expiração + revogação, tudo auditado. Na demo é uma simulação de fluxo.

## Portal
Pessoa (`Person`) ↔ paciente (`Patient`) por `PatientLink { relation, canSeeClinical, canSeeFinancial, canSchedule }`:
`self`, `tutor`, `responsavel_legal`, `responsavel_financeiro`. Psicologia com menor: responsável sem acesso clínico por padrão.
Portal mostra só o que foi explicitamente liberado (`releasedToPortal`).

## “Visualizar como perfil”
Menu do usuário → simula a interface com as permissões de outro usuário do tenant (faixa amarela visível, trilha registra “(como X)”).
