import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

const devSecret = "dev-only-change-me-please-at-least-32-characters";

if (!process.env.BETTER_AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET must be set in production.");
}

function trustedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? "http://localhost:5188")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? devSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.API_URL ?? "http://localhost:3088",
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
});
