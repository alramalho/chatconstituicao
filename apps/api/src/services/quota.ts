import type { QuotaInfo } from "@chatconstituicao/shared";
import { supabase } from "../lib/supabase.js";

const anonymousUsage = new Map<string, number>();

const ANON_LIMIT = 1;
const FREE_LIMIT = 5;

export async function checkQuota(
  userId: string | null,
  ip: string
): Promise<QuotaInfo> {
  if (!userId) {
    const used = anonymousUsage.get(ip) ?? 0;
    return { questionsUsed: used, questionsLimit: ANON_LIMIT, authenticated: false };
  }

  const { data } = await supabase
    .from("user_quotas")
    .select("questions_used, questions_limit")
    .eq("user_id", userId)
    .single();

  if (!data) {
    await supabase
      .from("user_quotas")
      .insert({ user_id: userId, questions_used: 0, questions_limit: FREE_LIMIT });
    return { questionsUsed: 0, questionsLimit: FREE_LIMIT, authenticated: true };
  }

  return {
    questionsUsed: data.questions_used,
    questionsLimit: data.questions_limit,
    authenticated: true,
  };
}

export async function decrementQuota(
  userId: string | null,
  ip: string
): Promise<void> {
  if (!userId) {
    const used = anonymousUsage.get(ip) ?? 0;
    anonymousUsage.set(ip, used + 1);
    return;
  }

  await supabase.rpc("increment_questions_used", { uid: userId });
}

export async function addQuota(
  userId: string,
  amount: number
): Promise<void> {
  await supabase.rpc("add_questions_limit", { uid: userId, amount });
}
