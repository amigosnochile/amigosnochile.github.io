-- Meu Dia: biblioteca e tracker de leitura.

create table if not exists livros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  titulo text not null,
  autor text,
  paginas int,
  pagina_atual int not null default 0,
  status text not null default 'quero' check (status in ('lendo', 'quero', 'lido')),
  favorito boolean not null default false,
  nota int check (nota between 1 and 5),
  iniciado_em date,
  terminado_em date,
  criado_em timestamptz not null default now()
);

-- Um registro por dia em que ela leu (paginas = quantas páginas avançou naquele dia)
create table if not exists leitura_dias (
  user_id uuid not null references auth.users on delete cascade,
  dia date not null,
  paginas int not null default 0,
  primary key (user_id, dia)
);

alter table perfil add column if not exists meta_livros int not null default 12;

do $$
declare t text;
begin
  foreach t in array array['livros','leitura_dias'] loop
    execute format('drop trigger if exists dono on %I', t);
    execute format('create trigger dono before insert on %I for each row execute function preencher_dono()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists dono_%1$s on %1$I', t);
    execute format('create policy dono_%1$s on %1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
