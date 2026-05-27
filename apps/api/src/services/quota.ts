import type { QuotaInfo } from "@chatconstituicao/shared";
import { prisma } from "../lib/prisma.js";

const anonymousUsage = new Map<string, number>();

const ANON_LIMIT = parseInt(process.env.ANON_LIMIT ?? "3", 10);
const FREE_LIMIT = 10;

export async function checkQuota(
  userId: string | null,
  ip: string
): Promise<QuotaInfo> {
  if (!userId) {
    const used = anonymousUsage.get(ip) ?? 0;
    return { questionsUsed: used, questionsLimit: ANON_LIMIT, authenticated: false };
  }

  const data = await prisma.userQuota.findUnique({
    where: { userId },
  });

  if (!data) {
    await prisma.userQuota.create({
      data: { userId, questionsUsed: 0, questionsLimit: FREE_LIMIT },
    });
    return { questionsUsed: 0, questionsLimit: FREE_LIMIT, authenticated: true };
  }

  return {
    questionsUsed: data.questionsUsed,
    questionsLimit: data.questionsLimit,
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

  await prisma.userQuota.upsert({
    where: { userId },
    create: { userId, questionsUsed: 1, questionsLimit: FREE_LIMIT },
    update: { questionsUsed: { increment: 1 } },
  });
}

export async function resetQuota(
  userId: string | null,
  ip: string
): Promise<void> {
  if (!userId) {
    anonymousUsage.set(ip, 0);
    return;
  }

  await prisma.userQuota.upsert({
    where: { userId },
    create: { userId, questionsUsed: 0, questionsLimit: FREE_LIMIT },
    update: { questionsUsed: 0 },
  });
}

export async function addQuota(
  userId: string,
  amount: number
): Promise<void> {
  await prisma.userQuota.upsert({
    where: { userId },
    create: { userId, questionsUsed: 0, questionsLimit: FREE_LIMIT + amount },
    update: { questionsLimit: { increment: amount } },
  });
}
