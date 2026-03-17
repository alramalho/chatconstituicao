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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-cream rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-serif font-semibold text-brown">
            {tab === "login" ? "Entrar" : "Criar conta"}
          </h2>
          <button
            onClick={onClose}
            className="text-brown-light hover:text-brown transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-beige-dark mx-6">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors cursor-pointer ${
              tab === "login"
                ? "text-orange border-b-2 border-orange"
                : "text-brown-light"
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex-1 pb-2 text-sm font-medium transition-colors cursor-pointer ${
              tab === "register"
                ? "text-orange border-b-2 border-orange"
                : "text-brown-light"
            }`}
          >
            Registar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-brown-light mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-beige-dark bg-white text-sm outline-none focus:border-orange transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-brown-light mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 rounded-lg border border-beige-dark bg-white text-sm outline-none focus:border-orange transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-orange text-cream rounded-lg text-sm font-medium hover:bg-orange-dark transition-colors disabled:opacity-50 cursor-pointer"
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
