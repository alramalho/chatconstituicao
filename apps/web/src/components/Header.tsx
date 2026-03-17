import type { User } from "@supabase/supabase-js";
import type { QuotaInfo } from "@chatconstituicao/shared";

type HeaderProps = {
  user: User | null;
  quota: QuotaInfo | null;
  onLoginClick: () => void;
  onLogout: () => void;
};

export function Header({ user, quota, onLoginClick, onLogout }: HeaderProps) {
  const remaining = quota
    ? quota.questionsLimit - quota.questionsUsed
    : null;

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-beige border-b border-beige-dark">
      <h1 className="text-xl font-serif font-semibold text-brown tracking-tight">
        Chat Constituição
      </h1>

      <div className="flex items-center gap-4">
        {quota && (
          <span className="text-sm text-brown-light">
            {remaining}/{quota.questionsLimit} perguntas restantes
          </span>
        )}

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-brown-light truncate max-w-48">
              {user.email}
            </span>
            <button
              onClick={onLogout}
              className="text-sm text-orange-dark hover:text-orange transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            className="px-4 py-1.5 text-sm bg-orange text-cream rounded-lg hover:bg-orange-dark transition-colors cursor-pointer"
          >
            Entrar
          </button>
        )}
      </div>
    </header>
  );
}
