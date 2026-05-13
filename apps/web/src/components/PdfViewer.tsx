import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type PdfViewerHandle = {
  scrollToText: (text: string) => void;
};

type PdfViewerProps = {
  className?: string;
  width?: number;
  file?: string;
};

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  function PdfViewer({ className, width: widthProp, file = "/constituicao.pdf" }, ref) {
    const [numPages, setNumPages] = useState(0);
    const [pageToast, setPageToast] = useState<number | null>(null);
    const [containerWidth, setContainerWidth] = useState<number | undefined>(widthProp);
    const scrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);
    const pendingScroll = useRef<string | null>(null);
    const retryTimer = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => {
      if (widthProp) { setContainerWidth(widthProp); return; }
      if (!containerRef.current) return;
      const obs = new ResizeObserver(([entry]) => {
        setContainerWidth(entry.contentRect.width);
      });
      obs.observe(containerRef.current);
      return () => obs.disconnect();
    }, [widthProp]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
      setNumPages(numPages);
    }

    const doScroll = useCallback((text: string): boolean => {
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      const searchText = normalize(text).slice(0, 60);
      console.log("[scroll] searching for:", JSON.stringify(searchText));
      if (!scrollRef.current) return false;

      const textLayers = scrollRef.current.querySelectorAll(".react-pdf__Page__textContent");
      if (textLayers.length === 0) return false;

      for (let i = 0; i < textLayers.length; i++) {
        const spans = textLayers[i].querySelectorAll("span");
        if (spans.length === 0) continue;
        const fullText = normalize(Array.from(spans).map((s) => s.textContent).join(" "));
        if (fullText.toLowerCase().includes(searchText.toLowerCase())) {
          const pageEl = textLayers[i].closest(".react-pdf__Page") as HTMLElement | null;
          if (pageEl && scrollRef.current) {
            const pageNum = i + 1;
            if (toastTimer.current) clearTimeout(toastTimer.current);
            setPageToast(pageNum);
            toastTimer.current = setTimeout(() => setPageToast(null), 2000);
            pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
            console.log("[scroll] found on page", pageNum);
          }
          return true;
        }
      }
      console.warn("[scroll] no match found");
      return true;
    }, []);

    const scrollToText = useCallback((text: string) => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (!doScroll(text)) {
        pendingScroll.current = text;
      }
    }, [doScroll]);

    useEffect(() => {
      if (numPages > 0 && pendingScroll.current) {
        const text = pendingScroll.current;
        pendingScroll.current = null;
        // text layers render async after pages mount, retry a few times
        let attempts = 0;
        const tryScroll = () => {
          if (doScroll(text)) return;
          attempts++;
          if (attempts < 10) {
            retryTimer.current = setTimeout(tryScroll, 500);
          }
        };
        retryTimer.current = setTimeout(tryScroll, 500);
      }
    }, [numPages, doScroll]);

    useImperativeHandle(ref, () => ({ scrollToText }), [scrollToText]);

    return (
      <div ref={containerRef} className={`h-full relative ${className ?? ""}`}>
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overflow-x-hidden"
        >
          {pageToast !== null && (
            <div className="sticky top-3 z-10 flex justify-center pointer-events-none">
              <div className="bg-ink text-parchment text-xs font-mono px-3 py-1.5 rounded shadow-lg animate-pulse">
                Página {pageToast}
              </div>
            </div>
          )}
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-64 text-ink-faint text-sm italic font-serif">
                a carregar...
              </div>
            }
            error={
              <div className="flex items-center justify-center h-64 text-ink-faint text-sm italic font-serif">
                erro ao carregar o PDF
              </div>
            }
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  className="flex justify-center mb-1"
                >
                  <Page
                    pageNumber={pageNum}
                    width={containerWidth}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                </div>
              ))}
          </Document>
        </div>
      </div>
    );
  },
);
