// Meu Dia: função do servidor (Supabase Edge Function).
// - acao "ciclo" (a cada 5 min, pelo agendador): sincroniza Google Agenda, manda lembretes e o resumo da manhã.
// - ações chamadas pelo app: conectar-google, sincronizar, apagar-evento, testar-push, testar-resumo.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

if (env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")) {
  webpush.setVapidDetails(
    env("VAPID_CONTATO") || "mailto:meu-dia@example.com",
    env("VAPID_PUBLIC_KEY"),
    env("VAPID_PRIVATE_KEY"),
  );
}

type Perfil = {
  user_id: string; nome: string | null; email_resumo: string | null;
  hora_resumo: string; fuso: string; antecedencia_min: number;
};

// ---------- horário local ----------
function local(fuso: string, d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { iso: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute), dow };
}
const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;

// ---------- Google Agenda ----------
async function tokenGoogle(user_id: string): Promise<string | null> {
  const { data: t } = await admin.from("google_tokens").select("*").eq("user_id", user_id).maybeSingle();
  if (!t) return null;
  if (t.access_token && t.expira_em && new Date(t.expira_em).getTime() > Date.now() + 60_000) return t.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: t.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.error("google refresh", j); return null; }
  await admin.from("google_tokens").update({
    access_token: j.access_token,
    expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq("user_id", user_id);
  return j.access_token;
}

const GAPI = "https://www.googleapis.com/calendar/v3";
const evUrl = (cal: string, id = "") =>
  `${GAPI}/calendars/${encodeURIComponent(cal)}/events${id ? "/" + encodeURIComponent(id) : ""}`;
// google_id guardado como "<agenda>::<evento>", porque o mesmo evento pode estar em várias agendas
const separar = (gid: string) => {
  const k = gid.indexOf("::");
  return k < 0 ? { cal: "primary", id: gid } : { cal: gid.slice(0, k), id: gid.slice(k + 2) };
};
const soData = (ts: string, fuso: string) => local(fuso, new Date(ts)).iso;
const addDia = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

// Todas as agendas que ela vê no Google (próprias e compartilhadas), menos feriados/aniversários
async function agendas(H: Record<string, string>) {
  const r = await fetch(`${GAPI}/users/me/calendarList?maxResults=250`, { headers: H });
  if (!r.ok) { console.error("calendarList", await r.text()); return [{ id: "primary", nome: null as string | null, principal: true }]; }
  const j = await r.json();
  return (j.items ?? [])
    .filter((c: Record<string, unknown>) => !c.hidden && !c.deleted && !/#(holiday|contacts|weather)@/.test(String(c.id)))
    .map((c: Record<string, unknown>) => ({ id: String(c.id), nome: (c.summaryOverride ?? c.summary ?? null) as string | null, principal: !!c.primary }));
}

async function sincronizarGoogle(user_id: string, fuso: string) {
  const token = await tokenGoogle(user_id);
  if (!token) return { google: false };
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const lista = await agendas(H);
  const principal = lista.find((c) => c.principal)?.id ?? "primary";

  // 1. Compromissos criados no app/Claude que ainda não estão no Google (vão para a agenda principal)
  const { data: pend } = await admin.from("eventos").select("*")
    .eq("user_id", user_id).is("google_id", null).eq("enviar_google", true);
  for (const e of pend ?? []) {
    const corpo = e.dia_inteiro
      ? { start: { date: soData(e.inicio, fuso) }, end: { date: addDia(soData(e.fim ?? e.inicio, fuso), e.fim ? 0 : 1) } }
      : { start: { dateTime: e.inicio, timeZone: fuso }, end: { dateTime: e.fim ?? new Date(new Date(e.inicio).getTime() + 3600_000).toISOString(), timeZone: fuso } };
    const r = await fetch(evUrl(principal), {
      method: "POST", headers: H,
      body: JSON.stringify({ summary: e.titulo, location: e.local ?? undefined, description: e.nota ?? undefined, ...corpo }),
    });
    const j = await r.json();
    if (r.ok) await admin.from("eventos").update({ google_id: `${principal}::${j.id}`, origem: "google" }).eq("id", e.id);
    else console.error("google insert", j);
  }

  // 2. Puxa de todas as agendas: do começo do ano até 1 ano pra frente
  const timeMin = new Date(`${local(fuso).iso.slice(0, 4)}-01-01T00:00:00-03:00`).toISOString();
  const timeMax = new Date(Date.now() + 366 * 86400_000).toISOString();
  const vindos: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  let falhas = 0;
  for (const cal of lista) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
      if (pageToken) q.set("pageToken", pageToken);
      const r = await fetch(`${evUrl(cal.id)}?${q}`, { headers: H });
      const j = await r.json();
      if (!r.ok) { console.error("google list", cal.id, j); falhas++; break; }
      for (const g of j.items ?? []) {
        const diaTodo = !!g.start?.date;
        const ini = diaTodo ? g.start.date : g.start?.dateTime;
        const chave = `${g.iCalUID ?? g.id}|${ini}`; // mesmo convite em duas agendas aparece uma vez só
        if (!ini || vistos.has(chave)) continue;
        vistos.add(chave);
        vindos.push({
          user_id, google_id: `${cal.id}::${g.id}`, origem: "google", titulo: g.summary || "(sem título)",
          inicio: diaTodo ? `${g.start.date}T12:00:00Z` : g.start.dateTime,
          fim: diaTodo ? `${g.end.date}T12:00:00Z` : g.end?.dateTime,
          dia_inteiro: diaTodo, local: g.location ?? null, nota: g.description ?? null,
          agenda: cal.principal ? null : cal.nome,
          enviar_google: false, atualizado_em: new Date().toISOString(),
        });
      }
      pageToken = j.nextPageToken ?? "";
    } while (pageToken);
  }
  if (falhas === lista.length) return { google: false, erro: "Não consegui ler as agendas do Google." };

  if (vindos.length) await admin.from("eventos").upsert(vindos, { onConflict: "user_id,google_id" });

  // 3. Some do app o que foi apagado no Google (só se todas as agendas foram lidas)
  if (!falhas) {
    const { data: atuais } = await admin.from("eventos").select("id,google_id")
      .eq("user_id", user_id).eq("origem", "google").gte("inicio", timeMin).lt("inicio", timeMax);
    const ids = new Set(vindos.map((v) => v.google_id));
    const sumiram = (atuais ?? []).filter((a) => !ids.has(a.google_id)).map((a) => a.id);
    if (sumiram.length) await admin.from("eventos").delete().in("id", sumiram);
  }

  return { google: true, eventos: vindos.length, agendas: lista.length };
}

// ---------- Notificações ----------
async function push(user_id: string, titulo: string, corpo: string, url = "./") {
  const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", user_id);
  let enviados = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo, corpo, url }),
        { TTL: 3600, urgency: "high" },
      );
      enviados++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push", code, (e as Error).message);
    }
  }
  return enviados;
}

async function primeiraVez(chave: string) {
  const { data } = await admin.from("avisos_enviados").upsert({ chave }, { onConflict: "chave", ignoreDuplicates: true }).select();
  return (data ?? []).length > 0;
}

// Tudo o que acontece num dia, já em minutos do dia local
async function diaDe(p: Perfil, iso: string, dow: number) {
  const [{ data: blocos }, { data: eventos }, { data: habitos }, { data: checks }, { data: metas }, { data: passos }, { count: caixa }] =
    await Promise.all([
      admin.from("blocos").select("*").eq("user_id", p.user_id),
      admin.from("eventos").select("*").eq("user_id", p.user_id)
        .gte("inicio", new Date(Date.now() - 3 * 86400_000).toISOString())
        .lt("inicio", new Date(Date.now() + 3 * 86400_000).toISOString()),
      admin.from("habitos").select("*").eq("user_id", p.user_id).eq("ativo", true).order("ordem"),
      admin.from("habito_checks").select("habito_id").eq("user_id", p.user_id).eq("dia", iso),
      admin.from("metas").select("*").eq("user_id", p.user_id).eq("concluida", false).order("ordem"),
      admin.from("passos").select("*").eq("user_id", p.user_id).eq("feito", false).order("ordem"),
      admin.from("inbox").select("id", { count: "exact", head: true }).eq("user_id", p.user_id),
    ]);
  const bl = (blocos ?? []).filter((b) =>
    b.data ? b.data === iso : !b.dias || b.dias.length === 0 || b.dias.includes(dow)
  ).map((b) => ({ ...b, ini: hm(b.inicio), fimMin: hm(b.fim) })).sort((a, b) => a.ini - b.ini);
  const ev = (eventos ?? []).filter((e) => {
    if (!e.dia_inteiro) return local(p.fuso, new Date(e.inicio)).iso === iso;
    const a = e.inicio.slice(0, 10), z = (e.fim ?? e.inicio).slice(0, 10);
    return iso === a || (iso >= a && iso < z);
  }).map((e) => ({ ...e, ini: e.dia_inteiro ? -1 : local(p.fuso, new Date(e.inicio)).min }))
    .sort((a, b) => a.ini - b.ini);
  const feitos = new Set((checks ?? []).map((c) => c.habito_id));
  const proximos = (metas ?? []).slice(0, 3).map((m) => ({
    meta: m.titulo, passo: (passos ?? []).find((s) => s.meta_id === m.id)?.titulo,
  }));
  return { bl, ev, habitos: habitos ?? [], feitos, proximos, caixa: caixa ?? 0 };
}

function resumoTexto(p: Perfil, d: Awaited<ReturnType<typeof diaDe>>) {
  const partes: string[] = [];
  if (d.ev.length) partes.push(`${d.ev.length} compromisso${d.ev.length > 1 ? "s" : ""}`);
  if (d.bl.length) partes.push(`${d.bl.length} bloco${d.bl.length > 1 ? "s" : ""}`);
  const primeiro = [...d.ev.filter((e) => e.ini >= 0), ...d.bl].sort((a, b) => a.ini - b.ini)[0];
  return (partes.length ? `Hoje: ${partes.join(" e ")}.` : "Dia livre hoje.") +
    (primeiro ? ` Primeiro: ${primeiro.titulo} às ${fmt(primeiro.ini)}.` : "");
}

function resumoHtml(p: Perfil, d: Awaited<ReturnType<typeof diaDe>>, dataBonita: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const li = (t: string) => `<li style="margin:4px 0">${t}</li>`;
  const sec = (titulo: string, itens: string[]) => itens.length
    ? `<h3 style="font-size:15px;margin:18px 0 6px;color:#4B3F8F">${titulo}</h3><ul style="padding-left:18px;margin:0">${itens.join("")}</ul>` : "";
  const agenda = [
    ...d.ev.map((e) => ({ ini: e.ini, t: `<b>${e.ini < 0 ? "Dia todo" : fmt(e.ini)}</b> · ${esc(e.titulo)}${e.local ? ` <span style="color:#777">(${esc(e.local)})</span>` : ""}` })),
    ...d.bl.map((b) => ({ ini: b.ini, t: `<b>${fmt(b.ini)}–${fmt(b.fimMin)}</b> · ${esc(b.titulo)} <span style="color:#777">(bloco)</span>` })),
  ].sort((a, b) => a.ini - b.ini).map((x) => li(x.t));
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto;color:#222;font-size:15px;line-height:1.5">
<p style="font-size:18px;margin:0 0 4px">Bom dia${p.nome ? `, ${esc(p.nome)}` : ""} ☀️</p>
<p style="color:#666;margin:0">${dataBonita}</p>
${sec("Agenda de hoje", agenda) || "<p>Nada marcado hoje. Dia livre!</p>"}
${sec("Hábitos", d.habitos.map((h) => li(`${h.emoji ?? "•"} ${esc(h.nome)}${h.horario ? ` <span style="color:#777">às ${fmt(hm(h.horario))}</span>` : ""}`)))}
${sec("Um passo de cada vez", d.proximos.filter((x) => x.passo).map((x) => li(`${esc(x.passo!)} <span style="color:#777">(${esc(x.meta)})</span>`)))}
${d.caixa ? `<p style="margin-top:18px">📥 ${d.caixa} ${d.caixa > 1 ? "coisas" : "coisa"} na caixa de entrada esperando um lugar.</p>` : ""}
<p style="margin-top:22px;color:#888;font-size:13px">Uma coisa de cada vez. Você dá conta. 💜</p></div>`;
}

async function enviarResumo(p: Perfil, forcar = false) {
  const agora = local(p.fuso);
  if (!forcar && !(await primeiraVez(`resumo:${p.user_id}:${agora.iso}`))) return { ja: true };
  const d = await diaDe(p, agora.iso, agora.dow);
  const dataBonita = new Intl.DateTimeFormat("pt-BR", { timeZone: p.fuso, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  let email = false;
  if (p.email_resumo && env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("EMAIL_DE") || "Meu Dia <onboarding@resend.dev>",
        to: [p.email_resumo], subject: `Seu dia: ${dataBonita}`, html: resumoHtml(p, d, dataBonita),
      }),
    });
    email = r.ok;
    if (!r.ok) console.error("resend", await r.text());
  }
  const pushes = await push(p.user_id, `Bom dia${p.nome ? `, ${p.nome}` : ""} ☀️`, resumoTexto(p, d));
  return { email, pushes };
}

async function ciclo(p: Perfil) {
  try { await sincronizarGoogle(p.user_id, p.fuso); } catch (e) { console.error("sync", e); }
  const agora = local(p.fuso);
  const d = await diaDe(p, agora.iso, agora.dow);
  const ant = Math.max(5, p.antecedencia_min ?? 10);
  const naJanela = (ini: number) => { const falta = ini - agora.min; return falta <= ant && falta > ant - 6; };
  const quando = (ini: number) => { const f = ini - agora.min; return f <= 1 ? "Agora" : `Em ${f} min`; };

  for (const b of d.bl) {
    if (b.lembrar && naJanela(b.ini) && await primeiraVez(`bloco:${b.id}:${agora.iso}`))
      await push(p.user_id, `${quando(b.ini)}: ${b.titulo}`, `Bloco das ${fmt(b.ini)} às ${fmt(b.fimMin)}${b.nota ? ` · ${b.nota}` : ""}`);
  }
  for (const e of d.ev) {
    if (e.ini >= 0 && e.lembrar && naJanela(e.ini) && await primeiraVez(`evento:${e.id}:${agora.iso}`))
      await push(p.user_id, `${quando(e.ini)}: ${e.titulo}`, `Compromisso às ${fmt(e.ini)}${e.local ? ` · ${e.local}` : ""}`);
  }
  for (const h of d.habitos) {
    if (h.horario && !d.feitos.has(h.id) && naJanela(hm(h.horario)) && await primeiraVez(`habito:${h.id}:${agora.iso}`))
      await push(p.user_id, `${h.emoji ?? "✨"} ${h.nome}`, `Lembrete do hábito das ${fmt(hm(h.horario))}. Marque no app quando fizer.`);
  }
  const hr = hm(p.hora_resumo);
  if (agora.min >= hr && agora.min < hr + 30) await enviarResumo(p);
}

// ---------- Entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }

  // Chamada do agendador
  if (env("CRON_SECRET") && req.headers.get("x-cron-secret") === env("CRON_SECRET")) {
    const { data: perfis } = await admin.from("perfil").select("*");
    for (const p of perfis ?? []) { try { await ciclo(p); } catch (e) { console.error("ciclo", p.user_id, e); } }
    await admin.from("avisos_enviados").delete().lt("enviado_em", new Date(Date.now() - 7 * 86400_000).toISOString());
    return json({ ok: true, perfis: perfis?.length ?? 0 });
  }

  // Chamada do app: precisa estar logada
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ erro: "não autenticado" }, 401);
  const uid = u.user.id;
  const { data: p } = await admin.from("perfil").select("*").eq("user_id", uid).maybeSingle();
  const fuso = p?.fuso ?? "America/Sao_Paulo";

  try {
    switch (body.acao) {
      case "conectar-google": {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: String(body.code), client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
            redirect_uri: "postmessage", grant_type: "authorization_code",
          }),
        });
        const j = await r.json();
        if (!r.ok) return json({ erro: j.error_description ?? j.error }, 400);
        if (!j.refresh_token) {
          const { data: ja } = await admin.from("google_tokens").select("user_id").eq("user_id", uid).maybeSingle();
          if (!ja) return json({ erro: "O Google não mandou acesso permanente. Remova o app em myaccount.google.com/permissions e conecte de novo." }, 400);
        }
        await admin.from("google_tokens").upsert({
          user_id: uid,
          ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}),
          access_token: j.access_token,
          expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString(),
          atualizado_em: new Date().toISOString(),
        });
        return json(await sincronizarGoogle(uid, fuso));
      }
      case "status-google": {
        const { data } = await admin.from("google_tokens").select("atualizado_em").eq("user_id", uid).maybeSingle();
        return json({ conectado: !!data });
      }
      case "desconectar-google":
        await admin.from("google_tokens").delete().eq("user_id", uid);
        return json({ ok: true });
      case "sincronizar":
        return json(await sincronizarGoogle(uid, fuso));
      case "apagar-evento": {
        const { data: e } = await admin.from("eventos").select("*").eq("id", String(body.id)).eq("user_id", uid).maybeSingle();
        if (!e) return json({ ok: true });
        if (e.google_id) {
          const token = await tokenGoogle(uid);
          const { cal, id } = separar(e.google_id);
          if (token) await fetch(evUrl(cal, id), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        }
        await admin.from("eventos").delete().eq("id", e.id);
        return json({ ok: true });
      }
      case "testar-push":
        return json({ enviados: await push(uid, "Funcionou! 🎉", "É assim que os lembretes vão aparecer.") });
      case "testar-resumo":
        if (!p) return json({ erro: "perfil não encontrado" }, 400);
        return json(await enviarResumo(p, true));
      default:
        return json({ erro: "ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message }, 500);
  }
});
