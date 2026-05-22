import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_PATH = resolve(ROOT, "apps/api/src/data/codigo-civil.ts");
const INDEX_PATH = resolve(ROOT, "apps/api/src/data/codigo-civil.index.json");

const SECTION_SIZE = 30;
const SECTION_STEP = 12;
const TERMS_PER_SECTION = 28;

const stopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "esse",
  "esta",
  "este",
  "nos",
  "na",
  "nas",
  "no",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "sua",
  "suas",
  "seu",
  "seus",
  "um",
  "uma",
]);

function extractDocument() {
  const source = readFileSync(DATA_PATH, "utf8");
  const marker = "export const CODIGO_CIVIL: LegalDocumentNode = ";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${marker}`);
  const bodyStart = start + marker.length;
  const bodyEnd = source.lastIndexOf(";\n");
  if (bodyEnd <= bodyStart) throw new Error("Could not locate Código Civil object end");
  return JSON.parse(source.slice(bodyStart, bodyEnd));
}

function collectArticles(node, out = []) {
  if (node.content && node.articleNumber) out.push(node);
  for (const child of node.children ?? []) collectArticles(child, out);
  return out;
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function termProfile(articles) {
  const counts = new Map();
  for (const article of articles) {
    for (const token of tokens(article.title)) {
      counts.set(token, (counts.get(token) ?? 0) + 4);
    }
    for (const token of tokens(article.content ?? "")) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt"))
    .slice(0, TERMS_PER_SECTION)
    .map(([term]) => term);
}

function articleExcerpt(article) {
  return normalize(`${article.title} ${article.content ?? ""}`).slice(0, 360);
}

const document = extractDocument();
const articles = collectArticles(document);
const sections = [];

for (let start = 0; start < articles.length; start += SECTION_STEP) {
  const slice = articles.slice(start, start + SECTION_SIZE);
  if (!slice.length) break;
  const first = slice[0];
  const last = slice[slice.length - 1];
  const terms = termProfile(slice);
  sections.push({
    id: `codigo-civil.index.${sections.length + 1}`,
    title: `Artigos ${first.articleNumber}.º a ${last.articleNumber}.º`,
    firstArticleNumber: first.articleNumber,
    lastArticleNumber: last.articleNumber,
    articleIds: slice.map((article) => article.id),
    articleTitles: slice.map((article) => ({
      id: article.id,
      title: article.title,
    })),
    terms,
    text: [
      ...slice.map((article) => article.title),
      ...terms,
      ...slice.map(articleExcerpt),
    ].join(" "),
  });
}

const index = {
  documentId: "codigo-civil",
  source: "generated from apps/api/src/data/codigo-civil.ts",
  generatedAt: new Date().toISOString(),
  sectionSize: SECTION_SIZE,
  sectionStep: SECTION_STEP,
  sections,
};

writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
console.log(`wrote ${INDEX_PATH}`);
console.log(`${articles.length} articles, ${sections.length} index sections`);
