import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PdfViewerHandle = {
  scrollToPage: (page: number) => void;
  highlightText: (text: string) => void;
};

type PdfViewerProps = {
  className?: string;
};

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  function PdfViewer({ className }, ref) {
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
      setNumPages(numPages);
    }

    const scrollToPage = useCallback((page: number) => {
      if (page < 1 || page > numPages) return;
      setCurrentPage(page);
    }, [numPages]);

    const highlightText = useCallback((text: string) => {
      if (!containerRef.current) return;
      const textLayer = containerRef.current.querySelector(".react-pdf__Page__textContent");
      if (!textLayer) return;

      // Clear previous highlights
      textLayer.querySelectorAll(".source-highlight").forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ""), el);
          parent.normalize();
        }
      });

      // Find and highlight
      const spans = textLayer.querySelectorAll("span");
      const fullText = Array.from(spans).map((s) => s.textContent).join("");
      const idx = fullText.toLowerCase().indexOf(text.toLowerCase());
      if (idx === -1) return;

      let charCount = 0;
      for (const span of spans) {
        const spanText = span.textContent || "";
        const spanStart = charCount;
        const spanEnd = charCount + spanText.length;

        if (spanEnd > idx && spanStart < idx + text.length) {
          const highlightStart = Math.max(0, idx - spanStart);
          const highlightEnd = Math.min(spanText.length, idx + text.length - spanStart);

          const before = spanText.slice(0, highlightStart);
          const match = spanText.slice(highlightStart, highlightEnd);
          const after = spanText.slice(highlightEnd);

          span.textContent = "";
          if (before) span.appendChild(document.createTextNode(before));

          const mark = document.createElement("mark");
          mark.className = "source-highlight";
          mark.style.backgroundColor = "rgba(212, 119, 11, 0.25)";
          mark.style.borderRadius = "2px";
          mark.textContent = match;
          span.appendChild(mark);

          if (after) span.appendChild(document.createTextNode(after));

          if (highlightStart === 0) {
            mark.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }

        charCount = spanEnd;
      }
    }, []);

    useImperativeHandle(ref, () => ({ scrollToPage, highlightText }), [
      scrollToPage,
      highlightText,
    ]);

    useEffect(() => {
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [currentPage]);

    return (
      <div className={`flex flex-col h-full bg-white ${className ?? ""}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-beige-dark bg-beige/50">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1 text-sm rounded-lg bg-beige hover:bg-beige-dark disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span className="text-sm text-brown-light">
            Página {currentPage} de {numPages || "..."}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="px-3 py-1 text-sm rounded-lg bg-beige hover:bg-beige-dark disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Seguinte →
          </button>
        </div>

        <div ref={containerRef} className="flex-1 overflow-y-auto flex justify-center py-4">
          <Document
            file="/constituicao.pdf"
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-64 text-brown-light text-sm">
                A carregar PDF...
              </div>
            }
            error={
              <div className="flex items-center justify-center h-64 text-brown-light text-sm">
                Erro ao carregar o PDF.
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          </Document>
        </div>
      </div>
    );
  },
);
