import type { User } from "@supabase/supabase-js";

type HeaderProps = {
  user: User | null;
  onLoginClick: () => void;
  onLogout: () => void;
};

export function Header({ user, onLoginClick, onLogout }: HeaderProps) {
  return (
    <div className="inline-flex items-center gap-6 px-6 py-2 border-[2px] border-ink bg-parchment">
      <h1 className="text-sm font-title tracking-[0.2em] uppercase text-ink whitespace-nowrap">
        Chat Constituicao
      </h1>

      <div className="w-px h-3 bg-ink/30" />

      {user ? (
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink-faint font-mono truncate max-w-32">
            {user.email}
          </span>
          <button
            onClick={onLogout}
            className="text-[11px] text-ink-faint hover:text-ink transition-colors cursor-pointer font-mono"
          >
            sair
          </button>
        </div>
      ) : (
        <button
          onClick={onLoginClick}
          className="text-[11px] text-ink-light hover:text-ink transition-colors cursor-pointer font-mono"
        >
          entrar
        </button>
      )}
    </div>
  );
}
