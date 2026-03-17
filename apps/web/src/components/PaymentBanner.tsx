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
    <div className="mx-4 mb-2 p-4 bg-orange/10 border border-orange/30 rounded-xl text-center">
      <p className="text-sm text-brown mb-3">
        Atingiu o limite de perguntas gratuitas.
      </p>
      <button
        onClick={handlePurchase}
        disabled={loading || !token}
        className="px-5 py-2 bg-orange text-cream rounded-lg text-sm font-medium hover:bg-orange-dark transition-colors disabled:opacity-50 cursor-pointer"
      >
        {loading ? "A processar..." : "Comprar 50 perguntas — 5€"}
      </button>
    </div>
  );
}
