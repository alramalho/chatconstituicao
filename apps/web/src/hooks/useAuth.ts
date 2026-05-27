import { useCallback } from "react";
import type { AuthUser } from "@chatconstituicao/shared";
import { authClient } from "@/lib/auth-client";

export function useAuth() {
  const session = authClient.useSession();
  const user = (session.data?.user ?? null) as AuthUser | null;

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) throw new Error(error.message ?? "Ocorreu um erro");
      await session.refetch();
    },
    [session],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await authClient.signUp.email({
        email,
        password,
        name: email,
      });
      if (error) throw new Error(error.message ?? "Ocorreu um erro");
      await session.refetch();
    },
    [session],
  );

  const signOut = useCallback(async () => {
    const { error } = await authClient.signOut();
    if (error) throw new Error(error.message ?? "Ocorreu um erro");
    await session.refetch();
  }, [session]);

  return { user, session: session.data, signIn, signUp, signOut, loading: session.isPending };
}
