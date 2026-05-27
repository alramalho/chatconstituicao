export type LegalDocumentNode = {
  id: string;
  title: string;
  children?: LegalDocumentNode[];
  content?: string;
  articleNumber?: number;
  pdfPage?: number;
};

export type ConstitutionNode = LegalDocumentNode;

export type SourceSnippet = {
  articleId: string;
  quotedText: string;
  articleTitle: string;
  breadcrumb: string;
  pdfPage?: number;
};

export type QuotaInfo = {
  questionsUsed: number;
  questionsLimit: number;
  authenticated: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
};
