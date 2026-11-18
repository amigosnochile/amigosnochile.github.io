-- Meu Dia: tarefas do dia (checklist) e rotinas salvas.

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  texto text not null,
  dia date not null,
  feito boolean not null default false,
  feito_em timestamptz,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists tarefas_dia on tarefas (user_id, dia);

-- Listas prontas, ex.: "Manhã" = acordar, lavar rosto, lente...
create table if not exists rotinas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  nome text not null,
  itens text[] not null default '{}',
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['tarefas','rotinas'] loop
    execute format('drop trigger if exists dono on %I', t);
    execute format('create trigger dono before insert on %I for each row execute function preencher_dono()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists dono_%1$s on %1$I', t);
    execute format('create policy dono_%1$s on %1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
