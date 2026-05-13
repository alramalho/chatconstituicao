import { useState, useRef, useCallback, useEffect } from "react";
import { Drawer } from "vaul";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { PdfViewer, type PdfViewerHandle } from "./components/PdfViewer";
import { AuthModal } from "./components/AuthModal";
import { QuotaDialog } from "./components/QuotaDialog";
import { QuotaBar } from "./components/QuotaBar";
import { useAuth } from "./hooks/useAuth";
import { useQuota } from "./hooks/useQuota";
import { documentConfig } from "./lib/document";

const PDF_WIDTH = 612;
const API_URL = import.meta.env.VITE_API_URL as string;

export default function App() {
  const { user, session, signIn, signUp, signOut } = useAuth();
  const token = session?.access_token;
  const { quota, refreshQuota, isExhausted, incrementAnon, resetAnon } = useQuota(token);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("refill") === "chapim") {
      resetAnon();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${API_URL}/api/refill-chapim`, { method: "POST", headers })
        .then(() => refreshQuota())
        .finally(() => {
          params.delete("refill");
          const clean = params.toString();
          window.history.replaceState({}, "", window.location.pathname + (clean ? `?${clean}` : ""));
        });
    }
  }, [token, resetAnon, refreshQuota]);

  useEffect(() => {
    const dev = {
      resetQuota: () => { resetAnon(); console.log("anon quota reset"); },
      refreshQuota: () => { refreshQuota(); console.log("quota refreshed"); },
      logout: () => { signOut(); console.log("logged out"); },
    };
    (window as unknown as Record<string, unknown>).dev = dev;
    console.log("dev commands: dev.resetQuota(), dev.refreshQuota(), dev.logout()");
  }, [resetAnon, refreshQuota, signOut]);

  const [showAuth, setShowAuth] = useState(false);
  const [showQuota, setShowQuota] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pdfRef = useRef<PdfViewerHandle>(null);
  const drawerPdfRef = useRef<PdfViewerHandle>(null);

  const handleMessageSent = useCallback(() => {
    if (!token) {
      incrementAnon();
    } else {
      refreshQuota();
    }
  }, [token, incrementAnon, refreshQuota]);

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
            <Header
              user={user}
              onLoginClick={() => setShowAuth(true)}
              onLogout={signOut}
            />
            <QuotaBar quota={quota} onClick={() => setShowQuota(true)} />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden px-4 md:px-6 py-4 gap-4">
          {/* Chat panel */}
          <div className="w-full md:shrink-0" style={{ maxWidth: PDF_WIDTH }}>
            <div className="h-full border-[3px] border-ink p-1">
              <div className="h-full border border-ink flex flex-col">
                <ChatPanel
                  token={token}
                  isExhausted={isExhausted}
                  isAuthenticated={!!user}
                  onSourceClick={handleSourceClick}
                  onMessageSent={handleMessageSent}
                  onLoginClick={() => setShowAuth(true)}
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

      {/* Quota dialog */}
      <QuotaDialog
        open={showQuota}
        onOpenChange={setShowQuota}
        quota={quota}
        onLoginClick={() => setShowAuth(true)}
        token={token}
      />

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
