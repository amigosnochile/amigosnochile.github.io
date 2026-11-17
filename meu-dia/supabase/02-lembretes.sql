-- Meu Dia: liga o "relógio" que roda a cada 5 minutos
-- (sincroniza o Google Agenda, manda lembretes e o resumo da manhã).
-- ANTES de rodar, troque as 2 coisas marcadas abaixo:
--   ENDERECO_DO_PROJETO  -> o começo da sua Project URL, ex: abcdxyz (de https://abcdxyz.supabase.co)
--   SEGREDO_DO_RELOGIO   -> o mesmo valor que você pôs no segredo CRON_SECRET da função

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('meu-dia') where exists (select 1 from cron.job where jobname = 'meu-dia');

select cron.schedule('meu-dia', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://ENDERECO_DO_PROJETO.supabase.co/functions/v1/meu-dia',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "SEGREDO_DO_RELOGIO"}'::jsonb,
    body := '{"acao": "ciclo"}'::jsonb
  );
$$);
