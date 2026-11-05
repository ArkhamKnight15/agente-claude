# Prospecta

Encontre empresas **sem site** na sua cidade e envie sua proposta pelo **WhatsApp** em poucos toques.
Funciona no computador e no celular, com a mesma lista de contatos nos dois.

## Como funciona

1. **Buscar:** escolha estado, cidade, tipo de empresa e quantidade. O app consulta o Google Places
   (ou o OpenStreetMap, gratuito) e mostra primeiro quem **não tem site**, depois quem só tem perfil
   (Instagram, iFood, Linktree…). Empresas fechadas ou de outras cidades são ignoradas.
2. **Enviar:** cada empresa vem com a mensagem pronta e editável. **Enviar no WhatsApp** abre a conversa
   com o texto; quem envia é você. Depois o app pergunta se você enviou e marca como **Mensagem enviada**.
3. **Acompanhar:** em cada cartão, marque o andamento em três etapas — **Enviada**, **Respondeu** e
   **Cliente** (tocar na etapa marcada desmarca). Em **Contatos**, filtre por etapa, anote observações,
   busque por nome ou telefone e exporte a planilha.
4. **Excluir:** a lixeira vermelha (com confirmação) tira a empresa dos seus contatos. Ela **não volta**
   em novas buscas nem importações — use também para quem pediu para não receber mensagens.

O andamento fica salvo no banco: uma nova busca nunca apaga o que você já fez, e a mesma empresa
(mesmo telefone) não aparece duplicada. **Quem você já chamou não aparece de novo na busca** (dá para
mostrar com “Mostrar quem já chamei”); ao voltar para o app, a lista confere o que foi feito em outro
aparelho.

“Sem site” significa que a fonte não informa site. Use **Conferir site** (abre a busca no Google)
antes de afirmar isso para o cliente.

## Importar uma lista

Em **Contatos → Importar empresas**, cole uma lista (uma empresa por linha) e veja a prévia antes de salvar:
novas, já salvas, já chamadas e linhas com erro. Aceita CSV com `;` ou `,`, planilha copiada (Excel,
Google Planilhas) e tabela em Markdown. Colunas: `nome;telefone;cidade;uf;site;categoria;endereco;fonte`
(com cabeçalho, em qualquer ordem). Obrigatórios: nome, cidade e UF. As empresas importadas seguem as
mesmas regras da busca: sem duplicar pelo telefone, sem perder o andamento e com a mensagem pronta.

## Publicar na Vercel

1. Importe este repositório na Vercel (*Add New → Project*). O Next.js é detectado sozinho.
2. **Banco:** *Storage → Create Database → Neon* (região São Paulo) → *Connect Project*.
   Isso cria `DATABASE_URL`. As tabelas são criadas sozinhas no primeiro acesso.
3. **Variáveis** (*Settings → Environment Variables*), sem aspas:

   | Variável | Obrigatória | O que é |
   | --- | --- | --- |
   | `APP_PASSWORD` | sim | Senha de acesso ao app (mínimo 8 caracteres). Trocar a senha desconecta todos os aparelhos. |
   | `GOOGLE_PLACES_API_KEY` | não | Chave da Places API (New). Sem ela, a busca usa o OpenStreetMap. |
   | `PLACES_DAILY_LIMIT` | não | Máximo de consultas ao Google por dia (padrão 30, cerca da cota gratuita do mês). Cada consulta traz até 20 empresas. `0` = sem limite. |
   | `OSM_CONTACT_EMAIL` | não | Seu e-mail, enviado ao OpenStreetMap para identificar o tráfego. |

4. *Deployments → ⋯ → Redeploy*. Se faltar algo, o app mostra exatamente qual variável configurar.

Não há cron, worker nem migração para rodar.

### Chave do Google Places

No [Google Cloud Console](https://console.cloud.google.com): crie um projeto, ative o faturamento,
ative a **Places API (New)** e crie uma chave em *APIs e serviços → Credenciais*. Em *Restrições de
aplicativo*, use **Nenhuma** (a Vercel não tem IP fixo). Em *Restrições de API*, marque só a
**Places API (New)**. Se o Google recusar, o app mostra o motivo informado por ele e o número do
projeto dono da chave.

## Rodar no computador

Requisitos: Node.js 22.9+ e um Postgres (local ou a connection string do Neon).

```bash
npm install
cp .env.example .env    # preencha DATABASE_URL e APP_PASSWORD
npm run dev             # http://localhost:3000
```

## Testes

```bash
npm run typecheck && npm run lint
TEST_DATABASE_URL=postgresql://…/prospecta_test npm test       # regras + fluxo com Postgres
E2E_DATABASE_URL=postgresql://…/prospecta_e2e npm run test:e2e  # navegador: computador e celular
```

Os testes usam bancos próprios (o nome precisa terminar em `_test` / `_e2e`) e um simulador da API do
Google: nenhuma chamada real é feita.

## Estrutura

```
src/
  app/          páginas (Buscar, Contatos, Mensagem, Entrar) e rotas (cidades, planilha)
  components/   ui/ (botões, campos, avisos), busca/, contatos/, mensagem/, layout/
  data/         nichos, estados e municípios (IBGE), rótulos de andamento
  lib/          regras puras: telefone, site, mensagem, planilha, sessão
  server/       banco, login, busca, fontes (Google Places, OpenStreetMap), ações
  types/
```

## Privacidade e boas práticas

- O app guarda apenas dados públicos de empresas (nome, endereço, telefone comercial, site).
- Toda mensagem termina oferecendo a opção de não receber mais contatos. Respeite quem pedir isso
  (marque **Não contatar**).
- Envie as mensagens com calma e para empresas do seu público. Disparos em massa podem levar o
  WhatsApp a bloquear o seu número.
- Dados do OpenStreetMap: © colaboradores do OpenStreetMap (licença ODbL). Municípios: IBGE.
