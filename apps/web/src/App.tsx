import { useState, useRef, useCallback } from "react";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { PdfViewer, type PdfViewerHandle } from "./components/PdfViewer";
import { AuthModal } from "./components/AuthModal";
import { useAuth } from "./hooks/useAuth";
import { useQuota } from "./hooks/useQuota";

function getArticlePage(articleId: string): number | null {
  const match = articleId.match(/art-(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  // Approximate: the constitution PDF starts articles around page 7
  // ~4 articles per page on average. This is a rough estimate.
  // TODO: replace with exact mapping from PDF
  return Math.max(7, Math.floor(7 + (num - 1) / 4));
}

export default function App() {
  const { user, session, signIn, signUp, signOut } = useAuth();
  const token = session?.access_token;
  const { quota, refreshQuota, isExhausted } = useQuota(token);

  const [showAuth, setShowAuth] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const pdfRef = useRef<PdfViewerHandle>(null);

  const handleSourceClick = useCallback(
    (articleId: string, quotedText?: string) => {
      const page = getArticlePage(articleId);
      if (page && pdfRef.current) {
        pdfRef.current.scrollToPage(page);
        if (quotedText) {
          // Delay slightly to let the page render
          setTimeout(() => pdfRef.current?.highlightText(quotedText), 500);
        }
      }
      setShowPdf(true);
    },
    [],
  );

  return (
    <div className="h-screen flex flex-col">
      <Header
        user={user}
        quota={quota}
        onLoginClick={() => setShowAuth(true)}
        onLogout={signOut}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        <div
          className={`
            flex flex-col
            w-full md:w-[45%] md:border-r md:border-beige-dark
            ${showPdf ? "hidden md:flex" : "flex"}
          `}
        >
          <ChatPanel
            token={token}
            isExhausted={isExhausted}
            onSourceClick={handleSourceClick}
            onMessageSent={refreshQuota}
          />
        </div>

        {/* PDF viewer */}
        <div
          className={`
            flex flex-col
            w-full md:w-[55%]
            ${showPdf ? "flex" : "hidden md:flex"}
          `}
        >
          <PdfViewer ref={pdfRef} />
        </div>
      </div>

      {/* Mobile toggle */}
      <div className="md:hidden fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setShowPdf((v) => !v)}
          className="p-3 bg-orange text-cream rounded-full shadow-lg hover:bg-orange-dark transition-colors cursor-pointer"
        >
          {showPdf ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </button>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSignIn={signIn}
          onSignUp={signUp}
        />
      )}
    </div>
  );
}
