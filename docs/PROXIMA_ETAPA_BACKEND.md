# Próxima etapa — backlog ordenado (backend e integrações reais)

Cada item exige autorização do proprietário antes de iniciar. Critérios de aceite objetivos.

1. **Projeto Supabase + schema base** (organizations, units, profiles, memberships, settings).
   Aceite: migrações versionadas; FKs compostas por tenant; RLS em todas as tabelas; testes com 2 tenants provando isolamento de select/insert/update/delete.
2. **Auth real** (Supabase Auth, convite, recuperação, MFA TOTP) substituindo o seletor de perfil.
   Aceite: sessão host-only; convite de uso único com expiração; `IdentityService` implementado; seletor demo só em ambiente demo.
3. **Implementar repositórios Supabase** atrás dos contratos de `src/data/repositories.ts` (pacientes, agenda, prontuário, documentos, cobranças).
   Aceite: componentes inalterados; React Query/cache com chaves `[tenantId, unitId, ...]`; troca de tenant invalida tudo.
4. **Agenda transacional**: constraints de exclusão de sobreposição por profissional/recurso; lista de espera com reserva atômica.
   Aceite: teste de concorrência com 2 aceites simultâneos → 1 sucesso, 1 erro tratado.
5. **Prontuário**: `form_versions` imutáveis, registros finalizados imutáveis (trigger), adendos, confidencialidade restrita, auditoria de leitura.
   Aceite: update em registro finalizado falha no banco; recepção sem select em restritos (teste RLS).
6. **Storage privado** com URLs assinadas; bucket público de marca; upload com antivírus/validação de tipo no servidor; SVG sanitizado.
7. **Financeiro clínico**: cobranças, pagamentos, estornos como ledger imutável; caixa; comissões com snapshot.
   Aceite: nenhum DELETE em movimentos liquidados; reversões vinculadas; soma de parcelas = total.
8. **Gateway (1 provedor primeiro, homologação)**: webhook verificado, `webhook_events` com dedupe, idempotência, conciliação diária.
   Aceite: replay do mesmo evento não duplica; timeout não cria segunda cobrança; redirect não confirma.
9. **Outbox + fila durável** (Resend e Evolution por tenant), preferências, janela de horário, bounce/suppression.
   Aceite: dedupe por evento/destinatário/canal; status entregue/lido só com evento do provedor.
10. **PWA dinâmico por tenant**: publicação de ícones versionados e manifesto servido por HTTPS a partir do upload da clínica.
11. **Domínios**: mapeamento hostname→tenant verificado, wildcard/custom domains (validar suporte vigente), TLS, canônico, recuperação.
12. **Super Admin real**: billing SaaS (contexto A), métricas a partir de dados reais, acesso assistido com grants temporários auditados.
13. **IA** (provedor substituível): ferramentas allowlisted no servidor, limites por tenant, logs minimizados, sem treino com dados, revisão humana.
14. **Conformidade**: validação LGPD/regulatória por especialidade, política de retenção por categoria, backups testados, plano de incidentes,
    revisão jurídica de assinaturas (Lei 14.063) e de TISS/NFS-e por provedor.
15. **QA de produção**: testes E2E contra backend, testes de RLS no CI, pentest, teste físico de instalação/push em iOS e Android.
