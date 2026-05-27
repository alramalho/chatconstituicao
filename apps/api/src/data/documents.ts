import type { LegalDocumentNode } from "@chatconstituicao/shared";
import { CONSTITUICAO } from "./constituicao.js";
import { CODIGO_CIVIL } from "./codigo-civil.js";
import {
  CODIGO_CIVIL_INDEX,
  CONSTITUICAO_INDEX,
  type LegalDocumentIndex,
} from "./legal-indexes.js";

export type LegalDocumentId = "constituicao" | "codigo-civil";

export type LegalDocumentConfig = {
  id: LegalDocumentId;
  title: string;
  shortTitle: string;
  domainLabel: string;
  articlePlural: string;
  specialistRole: string;
  root: LegalDocumentNode;
  index: LegalDocumentIndex;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocumentConfig> = {
  constituicao: {
    id: "constituicao",
    title: "Constituição da República Portuguesa",
    shortTitle: "Constituição",
    domainLabel: "direito constitucional português",
    articlePlural: "artigos da Constituição",
    specialistRole: "especialista em direito constitucional português",
    root: CONSTITUICAO,
    index: CONSTITUICAO_INDEX,
  },
  "codigo-civil": {
    id: "codigo-civil",
    title: "Código Civil Português",
    shortTitle: "Código Civil",
    domainLabel: "direito civil português",
    articlePlural: "artigos do Código Civil",
    specialistRole: "especialista em direito civil português",
    root: CODIGO_CIVIL,
    index: CODIGO_CIVIL_INDEX,
  },
};

function parseHostMap(raw: string | undefined): Record<string, LegalDocumentId> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [host, docId] = entry.split(":").map((part) => part.trim());
        return [host, docId as LegalDocumentId];
      })
      .filter(([, docId]) => docId === "constituicao" || docId === "codigo-civil")
  );
}

export function getDocumentById(id: string | undefined): LegalDocumentConfig {
  if (id === "codigo-civil") return LEGAL_DOCUMENTS["codigo-civil"];
  return LEGAL_DOCUMENTS.constituicao;
}

export function getDocumentForHost(hostHeader: string | undefined): LegalDocumentConfig {
  const host = hostHeader?.split(":")[0] ?? "";
  const map = parseHostMap(process.env.APP_HOST_DOCUMENT_MAP);
  return getDocumentById(map[host] ?? process.env.DOCUMENT_ID);
}

export function getFrontendUrlForHost(hostHeader: string | undefined): string {
  const host = hostHeader?.split(":")[0] ?? "";
  const raw = process.env.APP_HOST_FRONTEND_MAP;
  if (raw) {
    for (const entry of raw.split(",")) {
      const [mappedHost, ...urlParts] = entry.split(":");
      const url = urlParts.join(":").trim();
      if (mappedHost?.trim() === host && url) return url;
    }
  }
  return process.env.FRONTEND_URL ?? "http://localhost:5188";
}
