/* =====================================================
   Netlify Edge Function — OG tags dinâmicas por produto
   Intercepta requisições com ?p=X e troca as meta tags
   antes de entregar o HTML (para WhatsApp, Facebook, etc.)
===================================================== */

const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/1kz185SYCWeIEcJhWMWcPyZIhm4RvqGgwbU0DFEPw5kY/export?format=csv&gid=694267279";

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

  // Só age quando for a página inicial com ?p=numero
  if(url.pathname !== "/" && url.pathname !== "/index.html") return;
  if(!p || !/^\d+$/.test(p)) return;

  const index = parseInt(p, 10);

  // Busca CSV da planilha
  let produto = null;
  try{
    const csvResp = await fetch(URL_PLANILHA, {
      headers: { "cache-control": "no-cache" },
      cf: { cacheTtl: 120 }
    });
    if(csvResp.ok){
      const csv = await csvResp.text();
      const linhas = parseCSV(csv);
      // linha 0 = cabeçalho, então produto de índice `index` está na linha `index + 1`
      const linha = linhas[index + 1];
      if(linha && linha.length >= 3){
        produto = {
          titulo:    (linha[1]||"").trim(),
          imagem:    (linha[2]||"").trim(),
          descricao: (linha[3]||"").trim().replace(/\\n/g, " ").slice(0, 200)
        };
      }
    }
  }catch(e){
    // Se falhar, deixa passar o HTML original
    return;
  }

  if(!produto || !produto.titulo) return;

  // Pega o HTML original
  const resp = await context.next();
  const html = await resp.text();

  const baseUrl = url.origin + "/?p=" + index;
  const tituloEsc  = escapeAttr(produto.titulo);
  const descEsc    = escapeAttr(produto.descricao || "Confira esta oferta no Meus Achadinhos!");
  const imagemEsc  = escapeAttr(produto.imagem);
  const tituloFull = escapeAttr(produto.titulo + " — Meus Achadinhos");

  let novoHtml = html
    .replace(/<title>[^<]*<\/title>/, `<title>${tituloFull}</title>`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${tituloEsc}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${descEsc}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imagemEsc}">`);

  // Injeta tags extras antes de </head> (og:url, og:type product, twitter card)
  const extras = `
  <meta property="og:url" content="${baseUrl}">
  <meta property="og:type" content="product">
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

export const config = { path: "/" };
