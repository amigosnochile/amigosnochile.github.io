# Chile 2027: como colocar o site no ar

O site é um arquivo só (`index.html`). Os dados ficam no Supabase e a página é hospedada no GitHub Pages, os dois de graça. Quem entra precisa da senha do grupo.

Você faz isso uma vez só, em uns 20 minutos.

## 1. Criar o projeto no Supabase

1. Entre em [supabase.com](https://supabase.com) e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New project**.
   - Nome: `chile-2027`
   - Região: **South America (São Paulo)**
   - A senha do banco que ele pede é só do Supabase. Guarde, mas ela **não** é a senha do grupo.
3. Espere o projeto terminar de criar (1 a 2 minutos).

## 2. Criar as tabelas e colocar os dados

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Cole todo o conteúdo de `supabase/01-estrutura.sql` e clique em **Run**. Deve aparecer "Success".
3. Abra outra query, cole `supabase/02-dados.sql` e clique em **Run**. Isso traz o orçamento, as tarefas, o roteiro e a mala que já estavam na primeira versão.

## 3. Criar a senha do grupo

1. Vá em **Authentication → Users → Add user → Create new user**.
2. E-mail do grupo: `amigoschile2027@gmail.com`.
3. Senha: a senha que os 4 vão usar. Prefira uma frase fácil de lembrar e difícil de adivinhar, como `pisco-neve-valparaiso-27`.
4. Marque **Auto Confirm User** e crie.
5. Vá em **Authentication → Sign In / Providers** e **desligue "Allow new users to sign up"**. Assim ninguém consegue criar outra conta.

## 4. Ligar o site ao Supabase

1. No Supabase, clique no botão verde **Connect** (no topo) e role até o quadro **.env.local**.
2. Clique no botão de copiar, no canto do quadro. Ele copia duas linhas: `..._SUPABASE_URL=...` e `..._SUPABASE_PUBLISHABLE_KEY=...`.
3. Abra `config.js` no Bloco de Notas, apague a palavra `COLE_AQUI`, cole no lugar dela e salve.
   - **Nunca** cole a chave `secret` ou `service_role`.
4. Dê dois cliques no `index.html`. Deve abrir a tela de senha. Entre e confira se o orçamento e as tarefas aparecem.

## 5. Publicar no GitHub Pages

1. No [GitHub](https://github.com/new), crie um repositório **público** chamado `chile-2027`, sem README.
2. No terminal:

   ```bash
   cd C:\viagem
   git init -b main
   git add .
   git commit -m "Site da viagem"
   git remote add origin https://github.com/SEU-USUARIO/chile-2027.git
   git push -u origin main
   ```

3. No repositório, vá em **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**, depois `main` e `/ (root)`, e salve.
4. Em 1 ou 2 minutos o site aparece em `https://SEU-USUARIO.github.io/chile-2027/`.
5. Vá em **Actions**, abra **Manter o Supabase ativo** e clique em **Run workflow** para testar. Tem que ficar verde.

## 6. Mandar para o pessoal

Mande o link e a senha para Saskya, Vitor e Amanda (WhatsApp serve). Cada um entra uma vez, escolhe o próprio nome em **Você é** e pronto.

## Perguntas comuns

**A chave em `config.js` fica pública no GitHub. Tem problema?**
Não. Essa chave foi feita para ficar no navegador. Sem a senha do grupo ela não lê nem grava nada, porque o banco só libera o login do grupo.

**E se o Supabase pausar mesmo assim?**
Os dados não se perdem. Entre no painel do Supabase e clique em **Restore project**. A tarefa automática do GitHub existe justamente para isso não acontecer.

**Quero trocar a senha do grupo.**
Em **Authentication → Users**, abra o usuário do grupo e mude a senha. Quem já estava logado continua logado até sair.

**Alguém esqueceu o celular logado num lugar público.**
Troque a senha e, nesse aparelho, use **Ajustes da viagem → Sair deste aparelho**.

**Como mudo algo no site?**
Edite os arquivos em `C:\viagem` e rode `git add .`, depois `git commit -m "o que mudou"` e `git push`. O GitHub Pages atualiza sozinho.
