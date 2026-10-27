# Prospecta — agente de IA para prospecção e venda de sites

Sistema completo (frontend, backend, banco de dados, fila de tarefas e integrações oficiais) que encontra pequenas empresas brasileiras sem site próprio, verifica a presença digital com evidências, qualifica os leads, prepara abordagens personalizadas para a sua aprovação, acompanha as respostas em um CRM e gera propostas comerciais em PDF.

> **Princípios:** nada é enviado sem aprovação; nenhuma integração é simulada (sem credencial, a ação fica bloqueada com o motivo visível); dados apenas de fontes públicas e APIs autorizadas; pedidos de “não contatar” são respeitados para sempre.

---

## Sumário

1. [O que foi implementado](#o-que-foi-implementado)
2. [Arquitetura](#arquitetura)
3. [Como iniciar o sistema](#como-iniciar-o-sistema)
4. [Como configurar as APIs](#como-configurar-as-apis)
5. [Como conectar o WhatsApp oficial](#como-conectar-o-whatsapp-oficial)
6. [Como executar a primeira campanha](#como-executar-a-primeira-campanha)
7. [O que funciona sem credenciais e o que depende delas](#o-que-funciona-sem-credenciais-e-o-que-depende-delas)
8. [Testes](#testes)
9. [Implantação, backup e recuperação](#implantação-backup-e-recuperação)
10. [Segurança e LGPD](#segurança-e-lgpd)
11. [Premissas e limitações conhecidas](#premissas-e-limitações-conhecidas)

---

## O que foi implementado

| Área | Funcionalidades |
| --- | --- |
| **Pesquisa de empresas** | Google Places API (New) e OpenStreetMap (Overpass). Filtros por estado, cidade (lista oficial de 5.571 municípios do IBGE), nicho (15 nichos + termo livre), quantidade e prioridade mínima. Pesquisa avulsa com pré-visualização e importação seletiva. |
| **Deduplicação** | Por ID da fonte, telefone (E.164), domínio do site e nome + localização (similaridade de bigramas), sem fundir filiais numeradas ou empresas com telefones diferentes em endereços distintos. Nunca sobrescreve dados editados pelo usuário. |
| **Verificação de site** | Lê o campo de site do perfil, diferencia site próprio de Instagram/Facebook/diretórios/marketplaces/construtores gratuitos, faz **duas ou mais buscas web** (Brave, Serper ou Google CSE), visita candidatos (respeitando `robots.txt`, com proteção SSRF), avalia qualidade (HTTPS, celular, rodapé desatualizado, página estacionada…) e registra **evidências e data**. Classificações: sem site confirmado · provavelmente sem site · site com problemas · site profissional · inconclusivo — com confiança confirmado/provável/não verificado. Nunca confirma ausência com uma única consulta. |
| **Qualificação (0–100)** | Pontuação explicável em 6 fatores (ausência de site, negócio ativo, canais públicos, movimento/reputação, margem de melhoria, compatibilidade com o pacote) com detalhamento na ficha. Prioridade alta/média/baixa com limites configuráveis. |
| **Agente de IA** | Claude API com saída JSON validada por Zod: motivo da classificação, necessidade, benefícios, argumento de venda, mensagem de WhatsApp, e-mail e próxima ação. Usa apenas fatos verificados (prompt com proteção contra injeção). Verificador automático aponta promessas fora do pacote, preço divergente, garantias de resultado e links desconhecidos. Sem chave de IA, usa modelos de mensagem determinísticos. |
| **Abordagem** | Fila de revisão, edição, aprovação (individual ou em lote), envio pela API oficial ou **envio manual assistido** (abre `wa.me`/`mailto` com o texto e você confirma). Teste A/B com atribuição equilibrada. |
| **Regras de contato** | Lista de supressão (HMAC), limite de mensagens sem resposta, intervalo mínimo, bloqueio de texto repetido, limites diários por canal, janela de horário (fuso de São Paulo), opt-in obrigatório para WhatsApp API, bloqueio de negociações encerradas e de dados de demonstração. Reaplicadas no momento do envio. |
| **WhatsApp e e-mail** | Cloud API oficial (texto na janela de 24h, modelo aprovado fora dela), webhook com assinatura HMAC, idempotência e status entregue/lido/falhou. SMTP com cabeçalhos `List-Unsubscribe` (um clique, RFC 8058) e leitura de respostas por IMAP. |
| **Respostas** | Classificação (interessado, dúvida, sem interesse, pedido de parada) por regras + IA. Opt-out é sempre determinístico. Atualiza o funil, cancela pendências e cria tarefas de resposta. |
| **CRM** | 12 etapas, quadro kanban (arrastar ou menu acessível), ficha completa com histórico, notas, próximos passos, motivos de perda, valor fechado, opt-in, exportação JSON e exclusão LGPD. Lista com busca por nome/telefone, filtros, paginação e exportação CSV. |
| **Propostas** | Geradas a partir do pacote padrão (R$ 500), editáveis, **aprovação obrigatória por administrador**, PDF real, envio por e-mail com anexo ou registro de envio manual, mensagem de acompanhamento, aceite/recusa. |
| **Automação** | Campanha executa: pesquisar → coletar → verificar sites → deduplicar → qualificar → gerar mensagens → fila de revisão → enviar aprovadas → registrar → identificar interessados → atualizar CRM → próximas ações → relatório. Retomável após falhas, idempotente, com pausar/retomar/cancelar a qualquer momento e limites de quantidade e cota diária. |
| **Dashboard e relatórios** | Indicadores calculados do banco (empresas, sem site, qualificados, preparados, enviados, respostas, interessados, propostas, vendas, receitas potencial e realizada, taxas, custo por cliente). Relatórios por nicho, canal, variante A/B (teste z), dia/horário, regiões e funil — com **amostra mínima** antes de qualquer conclusão. |
| **Administração** | Usuários com papéis (Administrador, Operador, Leitura), auditoria, histórico de tarefas e erros, status do worker, integrações com teste real de conexão, preços/serviços editáveis, configurações do agente e da política de contato, custos, dados de demonstração. |

### Telas

Login · Dashboard · Campanhas (lista, nova, detalhe) · Pesquisa de empresas · Leads · Detalhe do lead · CRM e funil · Central de mensagens · Propostas (lista e editor) · Relatórios · Preços e serviços · Integrações · Configurações do agente · Usuários · Dados e LGPD · Tarefas e erros · Descadastro público.

---

## Arquitetura

```
Navegador ──► Next.js 16 (App Router, Server Components + Server Actions)
                 │  autenticação por sessão (cookie httpOnly) · RBAC · rate limit · auditoria
                 ├── /api/webhooks/whatsapp  (Meta → respostas e status)
                 ├── /api/public/unsubscribe (descadastro de e-mail, 1 clique)
                 └── PostgreSQL (Prisma 7)  ◄──  Worker Node (npm run worker)
                                                   fila em Postgres (SKIP LOCKED), rotinas recorrentes
                                                   Google Places · Overpass · busca web · Claude · WhatsApp · SMTP/IMAP
```

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Web + API | Next.js 16, React 19, TypeScript | Um só projeto para telas e backend; Server Actions com proteção CSRF nativa. |
| Estilo | Tailwind CSS 4, tokens claro/escuro, Lucide | Design consistente sem bibliotecas pesadas; gráficos em SVG próprio. |
| Banco | PostgreSQL 16 + Prisma 7 (adapter `pg`) | Migrações versionadas, tipagem ponta a ponta. |
| Tarefas em segundo plano | Fila própria no PostgreSQL | Sem Redis: retomável, idempotente, visível na tela de tarefas. |
| IA | `@anthropic-ai/sdk` (modelo e esforço por variável de ambiente) | Saída estruturada validada; fallback de recusa no servidor. |

Estrutura de pastas:

```
src/
  app/            páginas (App Router), rotas de API e webhooks
  components/     ui/ (primitivos acessíveis), charts/, layout/, messages/, forms/
  data/           nichos, municípios do IBGE, plataformas (redes/diretórios), rótulos
  lib/            funções puras: telefone, URLs, formatação, CSV, estatística
  lib/agent/      regras do agente: pontuação, análise de site, política de contato, classificador, templates
  server/         acesso a dados e integrações (somente servidor)
    actions/      Server Actions (validação + permissões)
    agent/        verificador de sites, agente de qualificação, processamento de respostas
    integrations/ Google Places, OSM, busca web, WhatsApp, e-mail, Claude, HTTP seguro
    jobs/         fila, handlers e executor
    services/     leads, campanhas, mensagens, propostas, métricas, relatórios…
  worker/         processo em segundo plano
prisma/           schema, migrações e seeds
tests/            unitários e integração (Vitest + PostgreSQL)
e2e/              testes de ponta a ponta (Playwright)
scripts/          backup, restauração e criação de usuário
```

---

## Como iniciar o sistema

Requisitos: **Node.js 22.9+**, **PostgreSQL 14+** (testado com 16).

```bash
git clone https://github.com/ArkhamKnight15/agente-claude.git
cd agente-claude
npm install
cp .env.example .env          # preencha DATABASE_URL, APP_SECRET (openssl rand -hex 32), ADMIN_EMAIL e ADMIN_PASSWORD
npm run db:deploy             # aplica as migrações
npm run db:seed               # cria o administrador, o pacote de R$ 500 e as configurações padrão
npm run dev:all               # sobe a aplicação (http://localhost:3000) e o worker juntos
```

Em produção: `npm run build`, depois `npm start` (web) e `npm run worker` (worker) como **dois processos**.

Opcional — dados de demonstração (fictícios, marcados como “demonstração”, envio bloqueado):

```bash
npm run db:seed:demo          # remova depois em Dados e LGPD → Remover dados de demonstração
```

Criar mais usuários: pela tela **Usuários** ou `npm run user:create -- email@empresa.com "Nome" OPERATOR`.

> **O worker precisa estar rodando** para pesquisas, verificações, envios e leitura de respostas. O menu lateral mostra “Automação ativa” ou “Worker offline”.

---

## Como configurar as APIs

Todas as credenciais ficam no `.env` do servidor. Depois de alterar, reinicie a aplicação e o worker. A página **Integrações** mostra o que está ativo, as variáveis pendentes (sem exibir valores) e tem um botão **Testar conexão** que faz uma chamada real.

| Integração | Variáveis | Como obter |
| --- | --- | --- |
| Google Places API (New) | `GOOGLE_PLACES_API_KEY` | Google Cloud Console → crie um projeto → ative **Places API (New)** → habilite o faturamento → *Credenciais* → chave de API (restrinja por IP do servidor e à Places API). |
| OpenStreetMap | `OSM_ENABLED=true` (padrão) | Gratuito, sem chave. Informe `OSM_CONTACT_EMAIL` para identificar o tráfego. Cobertura varia por cidade. |
| Busca web | `SEARCH_PROVIDER` + chave | **Brave Search API** (`BRAVE_SEARCH_API_KEY`, api-dashboard.search.brave.com) ou **Serper** (`SERPER_API_KEY`, serper.dev). Google Programmable Search (`GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX`) só se você já tiver acesso — o Google encerrou o produto para novos clientes. Sem busca web, nenhuma empresa é marcada como “sem site confirmado”. |
| IA (Claude API) | `ANTHROPIC_API_KEY`, `LLM_MODEL`, `LLM_EFFORT` | console.anthropic.com → API Keys. Padrão: `claude-opus-5-5` com esforço `medium`. |
| E-mail (envio) | `SMTP_*`, `EMAIL_FROM` | SMTP do seu provedor (Google Workspace com senha de app, Zoho, Amazon SES, Brevo…). Configure **SPF, DKIM e DMARC** no domínio. |
| E-mail (respostas) | `IMAP_*` | Mesma caixa que recebe as respostas; lida a cada 5 minutos. |

Limites de custo: `PLACES_DAILY_LIMIT` e `SEARCH_DAILY_LIMIT` param as chamadas do dia quando atingidos (a campanha é pausada com o motivo e pode ser retomada).

---

## Como conectar o WhatsApp oficial

O sistema usa a **WhatsApp Business Platform (Cloud API)** da Meta. A ativação exige sua participação:

1. Tenha um **Portfólio Empresarial** verificado no Meta Business Manager (business.facebook.com), com CNPJ.
2. Em developers.facebook.com, crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
3. Registre um **número exclusivo** para a API (ele deixa de funcionar no aplicativo WhatsApp comum) e conclua a verificação.
4. Crie um **usuário do sistema** no Business Manager, atribua o app e a conta do WhatsApp e gere um **token permanente** com `whatsapp_business_messaging` e `whatsapp_business_management` → `WHATSAPP_ACCESS_TOKEN`.
5. Copie o **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID` e o **WABA ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`.
6. Em *Configurações do app → Básico*, copie a **Chave secreta do app** → `WHATSAPP_APP_SECRET`. Invente um texto longo para `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
7. Em *WhatsApp → Configuração*, cadastre o webhook `https://SEU-DOMINIO/api/webhooks/whatsapp` com o mesmo token e assine o campo **messages** (precisa de HTTPS público).
8. Crie e aguarde a aprovação de um **modelo de mensagem** (pt_BR) com `{{1}}` para o nome da empresa → `WHATSAPP_TEMPLATE_NAME` (ajuste `WHATSAPP_TEMPLATE_PARAMS` se usar mais variáveis).
9. Adicione um método de pagamento na conta do WhatsApp (a Meta cobra conversas iniciadas pela empresa).

**Política da Meta:** mensagens iniciadas pela empresa exigem **consentimento (opt-in)**. Por isso, por padrão o envio pela API só é liberado para leads com opt-in registrado (na ficha do lead) ou dentro de 24h após o cliente escrever. Para o primeiro contato sem opt-in, use o **envio manual assistido**: o botão “Abrir no WhatsApp” abre a conversa no seu aplicativo com o texto pronto e você confirma o envio no sistema. Fora da janela de 24h, a Meta entrega o **texto do modelo aprovado**, não o rascunho — isso é indicado na mensagem.

---

## Como executar a primeira campanha

1. Em **Preços e serviços**, revise o pacote padrão (preço, itens incluídos e não incluídos, prazo, pagamento).
2. Em **Configurações do agente**, preencha o **perfil do remetente** (nome, empresa, portfólio, assinatura) e revise a política de contato.
3. Em **Integrações**, confirme ao menos uma fonte de empresas (Google Places ou OpenStreetMap) e, de preferência, a busca web.
4. Inicie o worker (`npm run worker` ou `npm run dev:all`).
5. **Campanhas → Nova campanha**: estado, cidade, nicho, quantidade (ex.: 30), prioridade mínima e canal → *Iniciar campanha*.
6. Acompanhe o progresso ao vivo no detalhe da campanha (pode pausar, retomar ou cancelar).
7. Abra a **Central de mensagens → Para revisar**, leia cada mensagem, edite se quiser e aprove. Envie pela API (se configurada e permitida) ou pelo envio manual assistido.
8. Respostas chegam pelo webhook do WhatsApp ou pelo IMAP e atualizam o **CRM e funil**. Use a ficha do lead para criar a **proposta**, aprove-a e envie.
9. Veja os resultados no **Dashboard** e em **Relatórios**.

---

## O que funciona sem credenciais e o que depende delas

**Funciona sem nenhuma credencial externa:** login e usuários, CRM completo, funil, fichas, notas, tarefas, propostas com PDF, pontuação, mensagens por modelo padrão, fila de revisão e aprovação, envio manual assistido (`wa.me`/`mailto`), dashboard, relatórios, exportação CSV/JSON, LGPD (supressão, exclusão, descadastro), auditoria e fila de tarefas. O **OpenStreetMap** funciona sem chave (exige acesso à internet a `overpass-api.de`).

**Depende de credenciais/serviços externos:**

| Recurso | Depende de |
| --- | --- |
| Pesquisa no Google Maps | `GOOGLE_PLACES_API_KEY` (faturamento ativo no Google Cloud) |
| “Sem site **confirmado**” | Provedor de busca web (Brave/Serper/Google CSE) |
| Mensagens e análise por IA, classificação de respostas por IA | `ANTHROPIC_API_KEY` |
| Envio e recebimento pelo WhatsApp oficial | Conta Meta verificada, número, token, modelo aprovado e webhook HTTPS público |
| Envio de e-mail e propostas por e-mail | SMTP |
| Leitura de respostas por e-mail | IMAP |

---

## Testes

```bash
npm run typecheck     # TypeScript
npm run lint          # oxlint
npm test              # Vitest: unitários + integração (exige PostgreSQL; usa o banco prospecta_test)
npm run test:e2e      # Playwright: sobe a aplicação com o banco prospecta_e2e
```

Bancos de teste: crie `prospecta_test` e `prospecta_e2e` (ou defina `TEST_DATABASE_URL` / `E2E_DATABASE_URL`). Os utilitários de teste **recusam limpar** qualquer banco cujo nome não termine em `_test` ou `_e2e`.

O que os testes cobrem:

- **Unitários (61):** pontuação e desqualificação, classificação de respostas (opt-out prioritário), política de contato (supressão, opt-in, janela de 24h, insistência, duplicidade, limites, janela de horário), verificação de conteúdo das mensagens, modelos que não afirmam o que não foi verificado, deduplicação, classificação de URLs, análise de páginas, decisão de site (nunca “confirmado” com uma busca), `robots.txt`, bloqueio SSRF, mapeamento Google Places/OSM, telefones brasileiros, CSV seguro, estatística, senhas, tokens, permissões, assinatura e parsing do webhook do WhatsApp.
- **Integração (12, com PostgreSQL real):** campanha ponta a ponta com uma fonte de dados de teste (pesquisa paginada, deduplicação, verificação, qualificação, mensagens na fila sem envio, relatório), pausar/retomar, recuperação após queda do worker, não reabordar quem está em negociação, aprovação manual e bloqueio de envio sem integração, webhook do WhatsApp (assinatura, idempotência, interessado, opt-out), descadastro, exclusão LGPD mantendo a supressão, caminho com IA (dublê) e fallback, proposta com aprovação, PDF real e venda refletida nas métricas.
- **E2E (8):** proteção de rotas e login, dashboard, filtro de leads e ficha, aprovação na central e bloqueio de envio de demonstração, campanha sem fonte configurada, exportação CSV, integrações sem exposição de segredos, menu mobile com Esc e sem rolagem horizontal.

---

## Implantação, backup e recuperação

**Opção 1 — VPS/servidor com Docker** (recomendado para começar):

```bash
cp .env.example .env    # preencha (APP_URL com o domínio HTTPS)
docker compose up -d --build
docker compose exec web npx tsx prisma/seed.ts
```

Coloque um proxy HTTPS (Caddy, Nginx ou Traefik) na frente da porta 3000 — o webhook do WhatsApp exige HTTPS.

**Opção 2 — Plataformas gerenciadas** (Railway, Render, Fly.io): crie um PostgreSQL gerenciado e **dois serviços** do mesmo repositório: web (`npm run build` / `npx prisma migrate deploy && npm start`) e worker (`npm run worker`). Plataformas apenas serverless (como a Vercel) servem para a parte web, mas o worker precisa de um processo contínuo em outro lugar.

Verificação de saúde: `GET /api/health` (banco e worker).

**Backup:** `scripts/backup.sh` gera um dump compactado, valida o arquivo e remove os antigos. Agende diariamente:

```cron
15 3 * * * cd /app && DATABASE_URL=... ./scripts/backup.sh /backups 14 >> /var/log/prospecta-backup.log 2>&1
```

Guarde cópias fora do servidor (ex.: armazenamento S3 com criptografia). **Restauração:** `DATABASE_URL=... ./scripts/restore.sh backups/prospecta-AAAAMMDD-HHMMSS.dump` (pede confirmação). Teste a restauração periodicamente em um banco separado. Em provedores gerenciados, ative também os backups automáticos/PITR do PostgreSQL.

---

## Segurança e LGPD

- Senhas com **scrypt**; sessões em cookie `httpOnly`/`SameSite=Lax`/`Secure` com hash no banco; limite de tentativas de login por IP e por e-mail; tempo de resposta constante.
- **Permissões por papel** checadas em todas as páginas, ações e rotas; propostas e configurações só para administradores.
- Server Actions com verificação de origem (CSRF); cabeçalhos de segurança (CSP, `X-Frame-Options`, HSTS em produção).
- Webhook do WhatsApp com **assinatura HMAC** e idempotência; descadastro com token assinado.
- Acesso a sites de terceiros com bloqueio de IPs internos (SSRF), limite de tamanho, tempo e redirecionamentos, e respeito ao `robots.txt`.
- Segredos só em variáveis de ambiente; logs estruturados com mascaramento de telefone, e-mail e tokens; **auditoria** de login, aprovações, envios, exportações, exclusões e alterações de configuração.
- **LGPD:** apenas dados comerciais públicos; lista de supressão com HMAC que sobrevive à exclusão; exportação (JSON) e exclusão definitiva por lead; descadastro em um clique; retenção automática de leads nunca contatados; identificação do remetente e opt-out em toda mensagem. Base legal sugerida para B2B: legítimo interesse — documente sua avaliação (LIA). Isto não substitui orientação jurídica.
- **Termos das fontes:** os Termos do Google Maps Platform limitam o armazenamento de conteúdo do Places (o `place_id` pode ser guardado; demais campos têm restrições). Revise os termos antes de manter esses dados por longos períodos; a retenção automática de leads nunca contatados ajuda a minimizar o armazenamento. Dados do OpenStreetMap exigem atribuição (© colaboradores do OpenStreetMap, ODbL).

---

## Premissas e limitações conhecidas

- **Ambiente de desenvolvimento deste projeto:** a política de rede bloqueou o acesso a `overpass-api.de`, buscadores e `graph.facebook.com`, e não havia chaves de API. Por isso, as integrações externas foram implementadas e testadas com dados de teste/dublês, **não com chamadas reais**. As chamadas reais acontecem quando você configurar as credenciais (use “Testar conexão” na página Integrações).
- O Docker não pôde ser executado neste ambiente: `Dockerfile` e `docker-compose.yml` foram escritos, mas não testados aqui. Backup e restauração foram testados com PostgreSQL 16.
- Formulários de contato de sites de terceiros **não** são preenchidos automaticamente (riscos de spam e de violar termos); use WhatsApp, e-mail ou contato manual.
- WhatsApp “provável”: um celular comercial não garante WhatsApp; o sistema só considera WhatsApp confirmado quando informado pela própria empresa (fonte ou site).
- Taxas e conclusões dos relatórios exigem amostra mínima (20 envios por grupo) e significância estatística para comparações.
- O agente sugere próximos passos, mas não fecha contratos nem assume compromissos financeiros: propostas exigem aprovação e o fechamento é registrado por você.
