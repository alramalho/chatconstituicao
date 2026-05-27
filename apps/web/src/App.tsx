import { useState, useRef, useCallback } from "react";
import { Drawer } from "vaul";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { PdfViewer, type PdfViewerHandle } from "./components/PdfViewer";
import { documentConfig } from "./lib/document";

const PDF_WIDTH = 612;

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pdfRef = useRef<PdfViewerHandle>(null);
  const drawerPdfRef = useRef<PdfViewerHandle>(null);

  const handleSourceClick = useCallback(
    (articleId: string, quotedText?: string) => {
      console.log("[source-click]", { articleId, quotedText });
      if (!quotedText) return;
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        setDrawerOpen(true);
        setTimeout(() => {
          drawerPdfRef.current?.scrollToText(quotedText);
        }, 1500);
      } else {
        pdfRef.current?.scrollToText(quotedText);
      }
    },
    [],
  );

  return (
    <div className="h-screen flex flex-col bg-parchment">
      <div className="flex flex-col h-full mx-auto w-full" style={{ maxWidth: PDF_WIDTH * 2 + 16 }}>
        {/* Ink art — full width, above everything */}
        <div className="pt-4 px-4 md:px-6">
          <img src="/header_art_2_short.png" alt="" className="w-full h-auto lg:hidden" />
          <img src="/header_art_2_long.png" alt="" className="w-full h-auto hidden lg:block" />
        </div>

        <div className="px-4 md:px-6 pt-2">
          <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-2">
            <Header />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden px-4 md:px-6 py-4 gap-4">
          {/* Chat panel */}
          <div className="w-full md:shrink-0" style={{ maxWidth: PDF_WIDTH }}>
            <div className="h-full border-[3px] border-ink p-1">
              <div className="h-full border border-ink flex flex-col">
                <ChatPanel
                  onSourceClick={handleSourceClick}
                />
              </div>
            </div>
          </div>

          {/* PDF — desktop only */}
          <div
            className="hidden md:block flex-1 min-w-0 overflow-hidden"
          >
            <PdfViewer ref={pdfRef} file={documentConfig.pdfFile} />
          </div>
        </div>
      </div>

      {/* Mobile PDF drawer (vaul) */}
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-ink/20 z-50" />
          <Drawer.Content className="bg-parchment flex flex-col rounded-t-lg h-[85vh] fixed bottom-0 left-0 right-0 z-50 outline-none">
            <div className="p-4 bg-parchment rounded-t-lg flex-1 overflow-y-auto">
              <div aria-hidden className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-ink/20 mb-2" />
              <Drawer.Title className="text-xs text-center text-ink-faint font-mono mb-2">
                {documentConfig.documentTitle}
              </Drawer.Title>
              <PdfViewer ref={drawerPdfRef} width={window.innerWidth - 32} file={documentConfig.pdfFile} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
