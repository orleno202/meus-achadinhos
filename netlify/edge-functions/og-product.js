/* =====================================================
   Netlify Edge Function — OG tags dinâmicas por produto
   Suporta ?p=INDICE (legado) e ?p=HASH (novo)
===================================================== */

const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/1kz185SYCWeIEcJhWMWcPyZIhm4RvqGgwbU0DFEPw5kY/export?format=csv&gid=694267279";

/* Gera o mesmo hash usado no index.html */
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

function escapeAttr(s){
  return (s||"").toString()
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default async (request, context) => {
  const url = new URL(request.url);
  const p = url.searchParams.get("p");

  // Só age na home com ?p=algo
  if(url.pathname !== "/" && url.pathname !== "/index.html") return context.next();
  if(!p) return context.next();

  // Busca CSV da planilha
  let linhas = null;
  try {
    const csvResp = await fetch(URL_PLANILHA);
    if(csvResp.ok){
      const csv = await csvResp.text();
      linhas = parseCSV(csv);
    }
  } catch(e) {
    return context.next();
  }

  if(!linhas || linhas.length < 2) return context.next();

  let linha = null;

  if(/^\d+$/.test(p)){
    // Modo legado: índice numérico
    const index = parseInt(p, 10);
    linha = linhas[index + 1];
  } else {
    // Modo novo: procura pelo hash em todas as linhas
    for(let i = 1; i < linhas.length; i++){
      const l = linhas[i];
      if(!l || l.length < 2) continue;
      const titulo = (l[1]||"").trim();
      const link = (l[4]||"").trim();
      const hash = hashProduto(titulo, link);
      if(hash === p){
        linha = l;
        break;
      }
    }
  }

  if(!linha || linha.length < 3) return context.next();

  const produto = {
    titulo:    (linha[1]||"").trim(),
    imagem:    (linha[2]||"").trim(),
    descricao: (linha[3]||"").trim().replace(/\\n/g, " ").slice(0, 200)
  };

  if(!produto.titulo) return context.next();

  // Pega HTML original
  const resp = await context.next();
  const html = await resp.text();

  const baseUrl = url.origin + "/?p=" + p;
  const tituloEsc  = escapeAttr(produto.titulo);
  const descEsc    = escapeAttr(produto.descricao || "Confira esta oferta no Meus Achadinhos!");
  const imagemEsc  = escapeAttr(produto.imagem);
  const tituloFull = escapeAttr(produto.titulo + " — Meus Achadinhos");

  let novoHtml = html
    .replace(/<title>[^<]*<\/title>/, `<title>${tituloFull}</title>`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${tituloEsc}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${descEsc}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imagemEsc}">`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="product">`);

  // Injeta tags extras antes de </head>
  const extras = `
  <meta property="og:url" content="${baseUrl}">
  <meta property="og:image:secure_url" content="${imagemEsc}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${tituloEsc}">
  <meta name="twitter:description" content="${descEsc}">
  <meta name="twitter:image" content="${imagemEsc}">
`;
  novoHtml = novoHtml.replace("</head>", extras + "</head>");

  return new Response(novoHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300"
    }
  });
};
