import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL as string;

type PaymentBannerProps = {
  token: string | undefined;
};

export function PaymentBanner({ token }: PaymentBannerProps) {
  const [loading, setLoading] = useState(false);

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

      if (!res.ok) throw new Error("Erro ao criar sessão de pagamento");

      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="mx-8 mb-4 py-4 border-t border-stone/60 text-center">
      <p className="text-xs text-ink mb-3 italic">
        Limite de perguntas gratuitas atingido.
      </p>
      <button
        onClick={handlePurchase}
        disabled={loading || !token}
        className="text-xs tracking-wide uppercase text-ink transition-colors disabled:opacity-40 cursor-pointer border-b border-dashed border-ink/40  pb-0.5"
      >
        {loading ? "A processar..." : "Desbloquear 50 perguntas — 5\u20ac"}
      </button>
    </div>
  );
}
