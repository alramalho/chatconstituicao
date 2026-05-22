import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_PDF = resolve(ROOT, "apps/api/src/data/19661125_dl_47344_codigo_civil_versao_consolidada_20230907.pdf");
const OUTPUT = resolve(ROOT, "apps/api/src/data/codigo-civil.structure.json");

const inputPdf = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_PDF;
const tmp = mkdtempSync(join(tmpdir(), "codigo-civil-structure-"));
const textPath = join(tmp, "codigo-civil.txt");

execFileSync("pdftotext", ["-layout", inputPdf, textPath], { stdio: ["ignore", "ignore", "inherit"] });

const headingMarker = "";
const articleMarker = "";

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function articleIdFromLine(line) {
  const match = line.match(/Artigo\s+(\d+)\.º(?:-([A-Z]))?/i);
  if (!match) return null;
  const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
  return `codigo-civil.art-${Number(match[1])}${suffix}`;
}

function articleNumberFromId(id) {
  return Number(id.match(/art-(\d+)/)?.[1] ?? 0);
}

function collectArticleIds(node) {
  const ids = [...node.articleIds];
  for (const child of node.children) ids.push(...collectArticleIds(child));
  node.articleIds = [...new Set(ids)].sort((a, b) => articleNumberFromId(a) - articleNumberFromId(b));
  return node.articleIds;
}

function flattenNodes(node, out = []) {
  if (node.id !== "codigo-civil.structure.root" && node.articleIds.length) {
    out.push({
      id: node.id,
      title: node.title,
      level: node.level,
      path: node.path,
      articleIds: node.articleIds,
      firstArticleNumber: articleNumberFromId(node.articleIds[0]),
      lastArticleNumber: articleNumberFromId(node.articleIds[node.articleIds.length - 1]),
    });
  }
  for (const child of node.children) flattenNodes(child, out);
  return out;
}

const root = {
  id: "codigo-civil.structure.root",
  title: "Código Civil",
  level: "root",
  path: [],
  articleIds: [],
  children: [],
};
const stack = [{ indent: -1, node: root }];
const lines = readFileSync(textPath, "utf8").split(/\r?\n/);
let inCodigoCivilIndex = false;
let nodeCounter = 0;

for (const rawLine of lines) {
  if (!inCodigoCivilIndex && /Anexo\s+C[ÓO]DIGO CIVIL/i.test(rawLine)) {
    inCodigoCivilIndex = true;
  }
  if (!inCodigoCivilIndex) continue;

  const headingIndex = rawLine.indexOf(headingMarker);
  const articleIndex = rawLine.indexOf(articleMarker);
  const markerIndex = headingIndex >= 0 ? headingIndex : articleIndex;
  if (markerIndex < 0) continue;

  const isArticle = articleIndex >= 0 && (headingIndex < 0 || articleIndex < headingIndex);
  const body = clean(rawLine.slice(markerIndex + 1));
  if (!body) continue;

  if (isArticle) {
    const articleId = articleIdFromLine(body);
    if (!articleId) continue;
    stack[stack.length - 1].node.articleIds.push(articleId);
    continue;
  }

  while (stack.length > 1 && markerIndex <= stack[stack.length - 1].indent) {
    stack.pop();
  }

  const parent = stack[stack.length - 1].node;
  const level = body.match(/^(Livro|Título|Subtítulo|Capítulo|Secção|Subsecção)\b/i)?.[1] ?? "Secção";
  const title = body;
  const path = [...parent.path, title];
  const node = {
    id: `codigo-civil.structure.${++nodeCounter}.${slug(title)}`,
    title,
    level,
    path,
    articleIds: [],
    children: [],
  };
  parent.children.push(node);
  stack.push({ indent: markerIndex, node });
}

collectArticleIds(root);
const nodes = flattenNodes(root);

const output = {
  documentId: "codigo-civil",
  sourcePdf: inputPdf.replace(`${ROOT}/`, ""),
  generatedAt: new Date().toISOString(),
  nodeCount: nodes.length,
  articleCount: root.articleIds.length,
  tree: root,
  nodes,
};

writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${OUTPUT}`);
console.log(`${nodes.length} nodes, ${root.articleIds.length} articles`);
