import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { QuotaInfo } from "@chatconstituicao/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type QuotaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota: QuotaInfo | null;
  onLoginClick: () => void;
  token: string | undefined;
};

const API_URL = import.meta.env.VITE_API_URL as string;

function QuotaContent({ quota, onLoginClick, token, onClose }: {
  quota: QuotaInfo | null;
  onLoginClick: () => void;
  token: string | undefined;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  if (!quota) return null;

  const remaining = Math.max(0, quota.questionsLimit - quota.questionsUsed);

  async function handlePurchase() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/stripe/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-2xl font-title text-ink">{remaining}</span>
        <span className="text-xs text-ink-faint font-mono ml-1">
          / {quota.questionsLimit} perguntas
        </span>
      </div>

      {!quota.authenticated && (
        <div className="border border-dashed border-accent/40 p-3 text-center">
          <p className="text-xs text-ink-faint font-mono mb-2">
            Cria uma conta grátis para desbloquear 7 perguntas extra.
          </p>
          <button
            onClick={() => { onClose(); onLoginClick(); }}
            className="text-xs tracking-wide uppercase text-accent hover:text-ink transition-colors cursor-pointer font-mono border-b border-dashed border-accent/40 hover:border-ink/40 pb-0.5"
          >
            Registar
          </button>
        </div>
      )}

      {quota.authenticated && remaining === 0 && (
        <div className="border border-dashed border-accent/40 p-3 text-center">
          <p className="text-xs text-ink-faint font-mono mb-2 italic">
            Limite de perguntas gratuitas atingido.
          </p>
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="text-xs tracking-wide uppercase text-accent hover:text-ink transition-colors cursor-pointer font-mono border-b border-dashed border-accent/40 hover:border-ink/40 pb-0.5 disabled:opacity-40"
          >
            {loading ? "A processar..." : "Desbloquear 50 perguntas — 5€"}
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-ink/100 rounded-[1px]" />
          <span className="text-[10px] text-ink-faint font-mono">disponivel</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-transparent border border-ink/80 rounded-[1px]" />
          <span className="text-[10px] text-ink-faint font-mono">usada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-ink/5 rounded-[1px]" />
          <span className="text-[10px] text-ink-faint font-mono">bloqueada</span>
        </div>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

export function QuotaDialog({ open, onOpenChange, quota, onLoginClick, token }: QuotaDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-ink/20 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-parchment rounded-t-lg px-6 pb-8 pt-4">
            <div className="mx-auto w-12 h-1.5 bg-ink/20 rounded-full mb-4" />
            <Drawer.Title className="text-xs text-center text-ink-faint font-mono uppercase tracking-widest mb-4">
              Perguntas
            </Drawer.Title>
            <QuotaContent
              quota={quota}
              onLoginClick={onLoginClick}
              token={token}
              onClose={() => onOpenChange(false)}
            />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs bg-parchment border-ink/20">
        <DialogHeader>
          <DialogTitle className="text-xs text-center text-ink-faint font-mono uppercase tracking-widest">
            Perguntas
          </DialogTitle>
          <DialogDescription className="sr-only">
            Estado das perguntas disponíveis
          </DialogDescription>
        </DialogHeader>
        <QuotaContent
          quota={quota}
          onLoginClick={onLoginClick}
          token={token}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
