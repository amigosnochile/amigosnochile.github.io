-- Meu Dia: estrutura do banco. Cole tudo no SQL Editor do Supabase e clique em Run.

create extension if not exists pgcrypto;

-- Quem é o dono de cada linha. Pelo app vem do login; pelo Claude (conector Supabase)
-- não há login, então usa a dona do perfil.
create or replace function preencher_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    new.user_id := coalesce(auth.uid(), (select user_id from perfil order by criado_em limit 1));
  end if;
  return new;
end $$;

create table if not exists perfil (
  user_id uuid primary key references auth.users on delete cascade,
  nome text,
  email_resumo text,
  hora_resumo time not null default '07:30',
  fuso text not null default 'America/Sao_Paulo',
  antecedencia_min int not null default 10,
  criado_em timestamptz not null default now()
);

-- Blocos de tempo: "9h-11h trabalho focado". dias = dias da semana (0=dom ... 6=sáb).
-- data preenchida = bloco só daquele dia. dias e data vazios = todo dia.
create table if not exists blocos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  titulo text not null,
  inicio time not null,
  fim time not null,
  dias int[],
  data date,
  cor text not null default 'c1',
  lembrar boolean not null default true,
  nota text,
  criado_em timestamptz not null default now()
);

-- Compromissos. origem 'google' = veio do Google Agenda; 'local' = criado aqui ou pelo Claude.
-- enviar_google = true faz o sistema criar o evento no Google Agenda na próxima sincronização.
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  google_id text,
  origem text not null default 'local',
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz,
  dia_inteiro boolean not null default false,
  local text,
  nota text,
  enviar_google boolean not null default true,
  lembrar boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (user_id, google_id)
);

create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  titulo text not null,
  porque text,
  prazo date,
  concluida boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists passos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  meta_id uuid not null references metas on delete cascade,
  titulo text not null,
  feito boolean not null default false,
  feito_em timestamptz,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- Caixa de entrada: joga a ideia aqui e organiza depois.
create table if not exists inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  texto text not null,
  criado_em timestamptz not null default now()
);

create table if not exists habitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  nome text not null,
  emoji text,
  horario time,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists habito_checks (
  habito_id uuid not null references habitos on delete cascade,
  user_id uuid references auth.users on delete cascade,
  dia date not null,
  primary key (habito_id, dia)
);

-- Celulares que aceitaram notificação.
create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- Só o servidor mexe nestas duas (sem políticas = app não acessa).
create table if not exists google_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  access_token text,
  expira_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create table if not exists avisos_enviados (
  chave text primary key,
  enviado_em timestamptz not null default now()
);

-- Dono automático + segurança: cada um só vê o que é seu.
do $$
declare t text;
begin
  foreach t in array array['blocos','eventos','metas','passos','inbox','habitos','habito_checks','push_subs'] loop
    execute format('drop trigger if exists dono on %I', t);
    execute format('create trigger dono before insert on %I for each row execute function preencher_dono()', t);
  end loop;
  foreach t in array array['perfil','blocos','eventos','metas','passos','inbox','habitos','habito_checks','push_subs','google_tokens','avisos_enviados'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['perfil','blocos','eventos','metas','passos','inbox','habitos','habito_checks','push_subs'] loop
    execute format('drop policy if exists dono_%1$s on %1$I', t);
    execute format('create policy dono_%1$s on %1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

create index if not exists eventos_inicio on eventos (user_id, inicio);
create index if not exists passos_meta on passos (meta_id);
create index if not exists checks_dia on habito_checks (user_id, dia);

-- Visão pronta para o Claude: agenda dos próximos 14 dias no horário de Brasília.
create or replace view agenda_proximos_dias with (security_invoker = true) as
with dias as (
  select (current_date at time zone 'America/Sao_Paulo')::date + g as dia
  from generate_series(0, 13) g
)
select d.dia, to_char(b.inicio, 'HH24:MI') as hora, to_char(b.fim, 'HH24:MI') as ate,
       'bloco' as tipo, b.titulo, b.nota as detalhe
from dias d join blocos b
  on (b.data = d.dia)
  or (b.data is null and (b.dias is null or cardinality(b.dias) = 0 or extract(dow from d.dia)::int = any(b.dias)))
union all
select (e.inicio at time zone 'America/Sao_Paulo')::date,
       case when e.dia_inteiro then 'dia todo' else to_char(e.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') end,
       case when e.dia_inteiro then null else to_char(e.fim at time zone 'America/Sao_Paulo', 'HH24:MI') end,
       'compromisso', e.titulo, coalesce(e.local, e.nota)
from eventos e
where e.inicio >= now() - interval '1 day' and e.inicio < now() + interval '14 days'
order by 1, 2;
