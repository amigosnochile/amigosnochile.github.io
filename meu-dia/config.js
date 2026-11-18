// Meu Dia: configuração. Veja o LEIA-ME.md, passo 4.
// 1. No Supabase, clique em "Connect" e role até o quadro ".env.local".
// (já preenchido com o projeto meu-dia).
// A chave "publishable" pode ficar pública: sem a senha ela não abre nada.
// NUNCA cole aqui a "secret key" nem a "service_role".

const COLADO_DO_SUPABASE = `
NEXT_PUBLIC_SUPABASE_URL=https://rdpqmoronqayyrnijswc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_maYzk6aGManOa7PVnrpVIw_7pbl7v50
`;

// ID do cliente OAuth do Google (termina em .apps.googleusercontent.com). Passo 6 do LEIA-ME.
const GOOGLE_CLIENT_ID = "";

// Chave pública das notificações (pode ficar pública).
const VAPID_PUBLIC_KEY = "BCZJInUUsDp5Sg3c3x58uC9MbXoSSo8bVjsjfLe97OQzh2H1LHfdpWpM40ep0T9jAsQ5_tr_cKQ-5SUcINZClrI";

(function () {
  function pegar(padrao) {
    const m = COLADO_DO_SUPABASE.match(new RegExp(padrao + "\\s*=\\s*[\"']?([^\\s\"']+)"));
    return m ? m[1] : "";
  }
  window.MEUDIA_CONFIG = {
    supabaseUrl: pegar("SUPABASE_URL"),
    supabaseKey: pegar("SUPABASE_(?:PUBLISHABLE(?:_DEFAULT)?|ANON)_KEY"),
    googleClientId: GOOGLE_CLIENT_ID,
    vapidPublicKey: VAPID_PUBLIC_KEY
  };
})();
