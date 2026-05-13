export type DocumentId = "constituicao" | "codigo-civil";

export type WebDocumentConfig = {
  id: DocumentId;
  productName: string;
  documentTitle: string;
  emptyDescription: string;
  inputPlaceholder: string;
  pdfFile: string;
  anonStorageKey: string;
};

const documentId = import.meta.env.VITE_DOCUMENT_ID as DocumentId | undefined;

const DOCUMENTS: Record<DocumentId, WebDocumentConfig> = {
  constituicao: {
    id: "constituicao",
    productName: "Chat Constituicao",
    documentTitle: "Constituicao da Republica Portuguesa",
    emptyDescription:
      "Faca perguntas sobre a Constituicao da Republica Portuguesa. As respostas incluem referencias directas aos artigos relevantes.",
    inputPlaceholder: "Faca uma pergunta sobre a Constituicao...",
    pdfFile: "/constituicao.pdf",
    anonStorageKey: "chatconstituicao_anon_used",
  },
  "codigo-civil": {
    id: "codigo-civil",
    productName: "Chat Codigo Civil",
    documentTitle: "Codigo Civil Portugues",
    emptyDescription:
      "Faca perguntas sobre o Codigo Civil Portugues. As respostas incluem referencias directas aos artigos relevantes.",
    inputPlaceholder: "Faca uma pergunta sobre o Codigo Civil...",
    pdfFile: "/codigo-civil.pdf",
    anonStorageKey: "chatcodigocivil_anon_used",
  },
};

export const documentConfig = DOCUMENTS[documentId ?? "constituicao"] ?? DOCUMENTS.constituicao;
