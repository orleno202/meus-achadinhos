/* =====================================================
   Netlify Edge Function — Lista de divulgação
   Retorna todos os links dos produtos em JSON
   Acesse: https://meusachadinhos.qd.je/divulgacao.json
===================================================== */

const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/1kz185SYCWeIEcJhWMWcPyZIhm4RvqGgwbU0DFEPw5kY/export?format=csv&gid=694267279";
const DOMINIO = "https://meusachadinhos.qd.je";

function hashProduto(titulo, link){
  const base = (link || titulo || "").toString();
  let h = 5381;
  for(let i = 0; i < base.length; i++){
    h = ((h << 5) + h) + base.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return "p" + Math.abs(h).toString(36);
}

function parseCSV(text){
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while(i < text.length){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        else{ inQuotes = false; i++; continue; }
      }else{ field += c; i++; continue; }
    }else{
      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === ','){ row.push(field); field = ''; i++; continue; }
      if(c === '\r'){ i++; continue; }
      if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows;
}

export default async (request, context) => {
  const url = new URL(request.url);

  if(url.pathname !== "/divulgacao.json") return context.next();

  let produtos = [];
  try {
    const csvResp = await fetch(URL_PLANILHA);
    if(csvResp.ok){
      const csv = await csvResp.text();
      const linhas = parseCSV(csv);
      const ERROS = /^#(ERROR!|N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;

      for(let i = 1; i < linhas.length; i++){
        const l = linhas[i];
        if(!l || l.length < 2) continue;
        const categoria = (l[0]||"").trim();
        const titulo = (l[1]||"").trim();
        const imagem = (l[2]||"").trim();
        const link = (l[4]||"").trim();
        if(!titulo || ERROS.test(titulo)) continue;
        if(!link) continue;

        const hash = hashProduto(titulo, link);
        produtos.push({
          hash: hash,
          categoria: categoria,
          titulo: titulo,
          imagem: imagem,
          url: DOMINIO + "/?p=" + hash
        });
      }
    }
  } catch(e) {
    return new Response(JSON.stringify({ error: "Falha ao carregar planilha", details: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const resposta = {
    total: produtos.length,
    geradoEm: new Date().toISOString(),
    links: produtos
  };

  return new Response(JSON.stringify(resposta, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "access-control-allow-origin": "*"
    }
  });
};
