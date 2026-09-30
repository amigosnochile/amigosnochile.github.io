-- Chile 2027 — estrutura do banco
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar de novo sem problema.

-- 1. Tabela única: cada item do site (depósito, gasto, tarefa, dia...) é uma linha.
create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- 2. Quem pode ver e editar: só o login do grupo.
--    Se trocar o e-mail do grupo, troque aqui e em config.js.
create table if not exists public.membros (
  email text primary key
);
alter table public.membros enable row level security; -- sem políticas: ninguém lê pela internet

insert into public.membros (email)
values ('amigoschile2027@gmail.com')
on conflict do nothing;

create or replace function public.eh_membro()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.membros
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.docs enable row level security;

drop policy if exists "grupo le"    on public.docs;
drop policy if exists "grupo cria"  on public.docs;
drop policy if exists "grupo edita" on public.docs;
drop policy if exists "grupo apaga" on public.docs;

create policy "grupo le"    on public.docs for select to authenticated using (public.eh_membro());
create policy "grupo cria"  on public.docs for insert to authenticated with check (public.eh_membro());
create policy "grupo edita" on public.docs for update to authenticated using (public.eh_membro()) with check (public.eh_membro());
create policy "grupo apaga" on public.docs for delete to authenticated using (public.eh_membro());

-- 3. Atualização parcial: junta campos sem apagar os outros
--    (ex.: dois votos ao mesmo tempo numa ideia não se atropelam).
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  k text;
  r jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  r := a;
  for k in select jsonb_object_keys(b) loop
    r := jsonb_set(r, array[k], public.jsonb_deep_merge(r -> k, b -> k), true);
  end loop;
  return r;
end;
$$;

create or replace function public.merge_doc(p_collection text, p_id text, p_patch jsonb)
returns void
language sql security invoker set search_path = public
as $$
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch),
         updated_at = now()
   where collection = p_collection and id = p_id;
$$;

revoke execute on function public.merge_doc(text, text, jsonb) from public, anon;
grant  execute on function public.merge_doc(text, text, jsonb) to authenticated;

-- 4. Tempo real: quando alguém edita, os outros celulares atualizam sozinhos.
do $$
begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then
  null;
end;
$$;
