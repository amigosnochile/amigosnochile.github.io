// Como preencher:
// 1. No Supabase, clique em "Connect" e role até o quadro ".env.local".
// 2. Clique no botão de copiar (os dois quadradinhos no canto do quadro).
// 3. Apague a palavra COLE_AQUI aqui embaixo, cole no lugar dela e salve (Ctrl+S).
// A chave "publishable" pode ficar pública: sem a senha do grupo ela não abre nada.
// NUNCA cole aqui a "secret key" nem a "service_role".

const COLADO_DO_SUPABASE = `
NEXT_PUBLIC_SUPABASE_URL=https://suphqfudiryvxmvwrdke.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_MT-wUitUxbvPBDvRK5c-_A_zvGgTyTx
`;

(function () {
  function pegar(padrao) {
    const m = COLADO_DO_SUPABASE.match(new RegExp(padrao + "\\s*=\\s*[\"']?([^\\s\"']+)"));
    return m ? m[1] : "";
  }
  window.VIAGEM_CONFIG = {
    supabaseUrl: pegar("SUPABASE_URL"),
    supabaseKey: pegar("SUPABASE_(?:PUBLISHABLE(?:_DEFAULT)?|ANON)_KEY"),
    groupEmail: "amigoschile2027@gmail.com"
  };
})();
