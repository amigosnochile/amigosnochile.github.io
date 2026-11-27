-- Meu Dia: vários usuários.
-- eu() = quem está logado; sem login (Claude pelo conector) = a primeira conta (dona do app).
create or replace function eu() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid(), (select user_id from perfil order by criado_em limit 1))
$$;

-- A visão de agenda passa a mostrar só os dados de eu()
create or replace view agenda_proximos_dias with (security_invoker = true) as
with dias as (
  select (current_date at time zone 'America/Sao_Paulo')::date + g as dia
  from generate_series(0, 13) g
)
select d.dia, to_char(b.inicio, 'HH24:MI') as hora, to_char(b.fim, 'HH24:MI') as ate,
       'bloco' as tipo, b.titulo, b.nota as detalhe
from dias d join blocos b
  on b.user_id = eu() and ((b.data = d.dia)
  or (b.data is null and (b.dias is null or cardinality(b.dias) = 0 or extract(dow from d.dia)::int = any(b.dias))))
union all
select (e.inicio at time zone 'America/Sao_Paulo')::date,
       case when e.dia_inteiro then 'dia todo' else to_char(e.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') end,
       case when e.dia_inteiro then null else to_char(e.fim at time zone 'America/Sao_Paulo', 'HH24:MI') end,
       'compromisso', e.titulo, coalesce(e.local, e.nota)
from eventos e
where e.user_id = eu() and e.inicio >= now() - interval '1 day' and e.inicio < now() + interval '14 days'
order by 1, 2;
