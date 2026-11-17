# Meu Dia: como colocar no ar

App de organização para TDAH: blocos de tempo, compromissos (sincronizados com o Google Agenda), metas em passos pequenos, hábitos e caixa de entrada. Lembretes chegam no iPhone e o resumo da manhã chega por e-mail. O Claude lê e escreve nos mesmos dados.

Tudo gratuito: GitHub Pages (site), Supabase (dados e lembretes), Resend (e-mail), Google Cloud (agenda).

Leva uns 45 minutos, uma vez só.

## 1. Supabase: criar o projeto

1. Em [supabase.com](https://supabase.com), **New project**. Nome: `meu-dia`. Região: **South America (São Paulo)**.
2. Espere terminar de criar.

## 2. Supabase: criar as tabelas

1. **SQL Editor → New query**, cole todo o `supabase/01-estrutura.sql` e **Run**. Deve aparecer "Success".

## 3. Supabase: criar o login dela

1. **Authentication → Users → Add user → Create new user**: e-mail e senha dela. Marque **Auto Confirm User**.
2. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.

## 4. Ligar o site ao Supabase

1. No Supabase, botão **Connect** → quadro **.env.local** → copiar.
2. No `config.js`, troque `COLE_AQUI` pelas duas linhas copiadas.

## 5. E-mail do resumo (Resend)

1. Crie conta em [resend.com](https://resend.com) **com o e-mail dela** (sem domínio próprio, o Resend só manda para o e-mail da conta).
2. **API Keys → Create API Key** e guarde a chave (`re_...`).

## 6. Google Agenda

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto `meu-dia`.
2. **APIs e serviços → Biblioteca** → ative a **Google Calendar API**.
3. **Tela de permissão OAuth** (Google Auth Platform): tipo **Externo**, nome "Meu Dia", e-mails de contato. Em **Público-alvo / Usuários de teste**, adicione o Gmail dela.
4. Depois clique em **Publicar app** (Em produção). Sem isso o Google desconecta a cada 7 dias. Ao conectar vai aparecer "o Google não verificou este app": clique **Avançado → Acessar Meu Dia**. É normal para app pessoal.
5. **Credenciais → Criar credenciais → ID do cliente OAuth** → **Aplicativo da Web**.
   - Origens JavaScript autorizadas: `https://amigosnochile.github.io`
6. Copie o **ID do cliente** para `GOOGLE_CLIENT_ID` no `config.js`, e guarde a **Chave secreta do cliente**.

## 7. Função do servidor (lembretes + Google)

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `meu-dia`. Apague o código de exemplo, cole todo o `supabase/functions/meu-dia/index.ts` e **Deploy**.
3. Na função, aba **Details/Settings**: **desligue "Verify JWT"** (a função já confere o login sozinha) e salve.
4. **Edge Functions → Secrets** (ou Project Settings → Edge Functions), adicione:

| Nome | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | ID do cliente do passo 6 |
| `GOOGLE_CLIENT_SECRET` | chave secreta do passo 6 |
| `RESEND_API_KEY` | chave do passo 5 |
| `VAPID_PUBLIC_KEY` | a mesma do `config.js` |
| `VAPID_PRIVATE_KEY` | a chave privada que veio junto (não vai no repositório) |
| `CRON_SECRET` | uma senha longa qualquer, inventada |

5. **SQL Editor**: abra `supabase/02-lembretes.sql`, troque `ENDERECO_DO_PROJETO` e `SEGREDO_DO_RELOGIO` (o mesmo `CRON_SECRET`) e **Run**.

## 8. Publicar o site

1. O app fica na pasta `meu-dia/` do site amigosnochile.github.io (o GitHub Pages já está ligado). Basta a mudança entrar na branch main.
2. Em uns 2 minutos fica em `https://amigosnochile.github.io/meu-dia/`.

## 9. No iPhone dela

1. Abra o endereço no **Safari**, entre com e-mail e senha.
2. **Compartilhar → Adicionar à Tela de Início**. Daqui pra frente, abra sempre pelo ícone.
3. Ícone de engrenagem → **Ligar lembretes** → Permitir → **Testar**.
4. **Conectar Google Agenda** (se a janela não abrir no app instalado, faça isso uma vez pelo Safari).
5. Preencha nome, e-mail e hora do resumo.

## 10. Claude como assistente

1. Em [claude.ai](https://claude.ai) (na conta dela): **Configurações → Conectores** → adicione **Supabase** e autorize o projeto `meu-dia`.
2. Crie um **Projeto** "Meu Dia" e cole as instruções do arquivo `CLAUDE-PROJETO.md`.
3. Pronto: no app do Claude ela pode perguntar "o que eu tenho hoje?", "o que faço agora?", "anota que preciso ligar pro banco", "quebra a meta X em passos".

Sem o conector, o botão **Copiar meu dia para o Claude** na tela Hoje copia tudo para colar numa conversa.

## Como funciona

- A cada 5 minutos o Supabase roda a função `meu-dia`, que:
  - puxa os compromissos do Google Agenda (ontem até +30 dias) e manda para o Google o que foi criado no app ou pelo Claude;
  - manda notificação X minutos antes de cada bloco, compromisso e hábito com horário (X = "Avisar antes" nos Ajustes);
  - na hora do resumo, manda e-mail + notificação com o dia.
- O app recarrega os dados sempre que volta para a tela, então o que o Claude cria aparece na hora.
