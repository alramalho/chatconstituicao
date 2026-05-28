export type LegalArticle = {
  id: string;
  title: string;
  articleNumber: number;
  content: string;
  pdfPage?: number;
};

export type LegalDocument = {
  id: string;
  title: string;
  articles: LegalArticle[];
};

export type LegalIndexArticleRange = {
  from: number;
  to: number;
};

export type LegalIndexSection = {
  number?: string;
  title: string;
  description?: string;
  articles?: LegalIndexArticleRange[];
  subsections?: LegalIndexSection[];
};

export type LegalDocumentIndex = {
  title: string;
  sections: LegalIndexSection[];
};

export const r = (from: number, to: number): LegalIndexArticleRange => ({ from, to });
