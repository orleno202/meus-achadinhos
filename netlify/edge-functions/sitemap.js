/* =====================================================
   Netlify Edge Function — Sitemap dinâmico
   Gera sitemap.xml com todos os produtos da planilha
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

function escapeXml(s){
  return (s||"").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async (request, context) => {
  const url = new URL(request.url);

  // Só age em /sitemap.xml
  if(url.pathname !== "/sitemap.xml") return context.next();

  // Busca CSV
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
        const titulo = (l[1]||"").trim();
        const link = (l[4]||"").trim();
        if(!titulo || ERROS.test(titulo)) continue;

        const hash = hashProduto(titulo, link);
        produtos.push({
          hash: hash,
          titulo: titulo
        });
      }
    }
  } catch(e) {
    // Se falhar, sitemap só com a home
  }

  // Data atual
  const hoje = new Date().toISOString().split("T")[0];

  // Monta o XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DOMINIO}/</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

  produtos.forEach(p => {
    xml += `  <url>
    <loc>${DOMINIO}/?p=${p.hash}</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  });

  xml += `</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
};
