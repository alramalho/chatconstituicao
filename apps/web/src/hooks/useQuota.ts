import { useEffect, useState, useCallback } from "react";
import type { QuotaInfo } from "@chatconstituicao/shared";
import { documentConfig } from "@/lib/document";

const API_URL = import.meta.env.VITE_API_URL as string;
const ANON_LIMIT = 3;
const LS_KEY = documentConfig.anonStorageKey;

function getAnonUsed(): number {
  try {
    return parseInt(localStorage.getItem(LS_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function setAnonUsed(n: number) {
  try {
    localStorage.setItem(LS_KEY, String(n));
  } catch {
    // storage full or blocked
  }
}

export function useQuota(token: string | undefined) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const refreshQuota = useCallback(async () => {
    if (!token) {
      const used = getAnonUsed();
      setQuota({ questionsUsed: used, questionsLimit: ANON_LIMIT, authenticated: false });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const incrementAnon = useCallback(() => {
    const next = getAnonUsed() + 1;
    setAnonUsed(next);
    setQuota({ questionsUsed: next, questionsLimit: ANON_LIMIT, authenticated: false });
  }, []);

  const resetAnon = useCallback(() => {
    setAnonUsed(0);
    setQuota({ questionsUsed: 0, questionsLimit: ANON_LIMIT, authenticated: false });
  }, []);

  const isExhausted = quota
    ? quota.questionsUsed >= quota.questionsLimit
    : false;

  return { quota, refreshQuota, isExhausted, incrementAnon, resetAnon };
}
