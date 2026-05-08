import { useState, type FormEvent } from "react";

type AuthModalProps = {
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
};

export function AuthModal({ onClose, onSignIn, onSignUp }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (tab === "login") {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm">
      <div className="bg-parchment-light w-full max-w-sm mx-4 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm tracking-[0.15em] uppercase text-ink">
            {tab === "login" ? "Entrar" : "Criar conta"}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors cursor-pointer text-sm"
          >
            fechar
          </button>
        </div>

        <div className="flex gap-6 mb-6">
          <button
            onClick={() => setTab("login")}
            className={`text-xs tracking-wide uppercase transition-colors cursor-pointer pb-1 ${
              tab === "login"
                ? "text-ink border-b border-ink"
                : "text-ink-faint"
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => setTab("register")}
            className={`text-xs tracking-wide uppercase transition-colors cursor-pointer pb-1 ${
              tab === "register"
                ? "text-ink border-b border-ink"
                : "text-ink-faint"
            }`}
          >
            Registar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs text-ink-faint mb-2 font-sans">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-0 py-2 bg-transparent border-b border-stone/60 text-sm outline-none focus:border-ink transition-colors font-serif"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-faint mb-2 font-sans">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-0 py-2 bg-transparent border-b border-stone/60 text-sm outline-none focus:border-ink transition-colors font-serif"
            />
          </div>

          {error && (
            <p className="text-xs text-red-800/70">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-xs tracking-[0.15em] uppercase text-ink border border-stone/60 hover:border-ink transition-colors disabled:opacity-40 cursor-pointer"
          >
            {loading
              ? "..."
              : tab === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
