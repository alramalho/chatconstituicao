import { useEffect, useState, useCallback } from "react";
import type { QuotaInfo } from "@chatconstituicao/shared";

const API_URL = import.meta.env.VITE_API_URL as string;

export function useQuota(token: string | undefined) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/quota`, { headers });
      if (res.ok) {
        const data = (await res.json()) as QuotaInfo;
        setQuota(data);
      }
    } catch {
      // silently fail
    }
  }, [token]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const isExhausted = quota
    ? quota.questionsUsed >= quota.questionsLimit
    : false;

  return { quota, refreshQuota, isExhausted };
}
