import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SOURCE_URL =
  "https://pgdlisboa.pt/leis/lei_mostra_articulado.php?ficha=1&nid=775&pagina=1&tabela=leis";
const SOURCE_VERSION = "89.ª versão - Lei n.º 39/2025, de 01/04";

function dumpDom(url) {
  return execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 80 * 1024 * 1024 }
  );
}

function decodeHtml(input) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|h\d)>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function pageUrl(page) {
  const ficha = (page - 1) * 100 + 1;
  return `https://pgdlisboa.pt/leis/lei_mostra_articulado.php?ficha=${ficha}&nid=775&pagina=${page}&tabela=leis`;
}

function extractArticles(html) {
  const matches = [...html.matchAll(/<table class="artigo"[\s\S]*?(?=<table class="artigo"|<table border="0" bgcolor="#ffffff" width="100%">|<\/body>)/gi)];

  return matches.flatMap((match) => {
    const block = match[0];
    const titleMatch = block.match(/<font[^>]*>\s*(?:&nbsp;|\s)*Artigo\s+([0-9]+)\.º(?:-([A-Z]))?\s*<br>\s*([^<]*)<\/font>/i);
    const contentMatch = block.match(/<td[^>]*valign="top"[^>]*colspan="4"[^>]*class="txt_base_n_l"[^>]*>([\s\S]*?)<\/td>/i);
    if (!titleMatch || !contentMatch) return [];

    const number = Number(titleMatch[1]);
    const suffix = titleMatch[2] ? `-${titleMatch[2].toLowerCase()}` : "";
    const heading = htmlToText(titleMatch[3]).replace(/^\(|\)$/g, "");
    const content = htmlToText(contentMatch[1]).replace(/\nMinistério da Justiça,[\s\S]*$/i, "");

    if (!number || !content) return [];

    return [
      {
        id: `codigo-civil.art-${number}${suffix}`,
        title: `Artigo ${number}.º${titleMatch[2] ? `-${titleMatch[2]}` : ""}${heading ? ` — ${heading}` : ""}`,
        articleNumber: number,
        content,
      },
    ];
  });
}

function chunkArticles(articles) {
  const chunks = [];
  for (let i = 0; i < articles.length; i += 100) {
    const slice = articles.slice(i, i + 100);
    const first = slice[0];
    const last = slice[slice.length - 1];
    chunks.push({
      id: `codigo-civil.artigos-${first.articleNumber}-${last.articleNumber}`,
      title: `Artigos ${first.articleNumber}.º a ${last.articleNumber}.º`,
      children: slice,
    });
  }
  return chunks;
}

function tsString(value) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPdfHtml(articles) {
  const articleHtml = articles
    .map(
      (article) => `<article>
        <h2>${escapeHtml(article.title)}</h2>
        ${escapeHtml(article.content)
          .split("\n")
          .map((line) => `<p>${line}</p>`)
          .join("\n")}
      </article>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Código Civil Português</title>
  <style>
    @page { margin: 18mm 16mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #211b16; line-height: 1.45; }
    h1 { font-size: 26px; margin: 0 0 8px; text-align: center; }
    .meta { font-size: 11px; text-align: center; margin-bottom: 28px; color: #5f554d; }
    article { break-inside: avoid; margin: 0 0 14px; }
    h2 { font-size: 13px; margin: 0 0 5px; color: #8a2d12; }
    p { font-size: 11px; margin: 0 0 4px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Código Civil Português</h1>
  <div class="meta">Fonte: PGDL/PGR Lisboa. ${escapeHtml(SOURCE_VERSION)}. Gerado em ${new Date().toISOString().slice(0, 10)}.</div>
  ${articleHtml}
</body>
</html>`;
}

const firstHtml = dumpDom(SOURCE_URL);
const articles = [];

for (let page = 1; page <= 40; page++) {
  const html = page === 1 ? firstHtml : dumpDom(pageUrl(page));
  const pageArticles = extractArticles(html);
  console.log(`page ${page}: ${pageArticles.length} articles`);
  if (pageArticles.length === 0) break;
  articles.push(...pageArticles);
}

const uniqueArticles = [...new Map(articles.map((article) => [article.id, article])).values()];

if (uniqueArticles.length < 2000) {
  throw new Error(`Expected at least 2000 Código Civil articles, found ${uniqueArticles.length}`);
}

const documentTree = {
  id: "codigo-civil",
  title: "Código Civil Português",
  children: chunkArticles(uniqueArticles),
};

const dataPath = resolve(ROOT, "apps/api/src/data/codigo-civil.ts");
writeFileSync(
  dataPath,
  `import type { LegalDocumentNode } from "@chatconstituicao/shared";\n\nexport const CODIGO_CIVIL_SOURCE = ${tsString({
    title: "Código Civil Português",
    sourceUrl: SOURCE_URL,
    sourceVersion: SOURCE_VERSION,
    generatedAt: new Date().toISOString(),
    articleCount: uniqueArticles.length,
  })} as const;\n\nexport const CODIGO_CIVIL: LegalDocumentNode = ${tsString(documentTree)};\n`
);

const publicDir = resolve(ROOT, "apps/web/public");
mkdirSync(publicDir, { recursive: true });
const htmlPath = resolve(publicDir, "codigo-civil.html");
const pdfPath = resolve(publicDir, "codigo-civil.pdf");
writeFileSync(htmlPath, buildPdfHtml(uniqueArticles));

execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ],
  { stdio: ["ignore", "inherit", "inherit"] }
);

console.log(`wrote ${dataPath}`);
console.log(`wrote ${htmlPath}`);
console.log(`wrote ${pdfPath}`);
