import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { logger } from "./lib/logger.js";
import chatRouter from "./routes/chat.js";
import quotaRouter from "./routes/quota.js";
import stripeRouter from "./routes/stripe.js";
import refillRouter from "./routes/refill.js";

const app = express();
const PORT = process.env.PORT ?? 3088;

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? "http://localhost:5188")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));

// Stripe webhook needs raw body — must come before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.all("/api/auth/{*any}", toNodeHandler(auth));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/chat", chatRouter);
app.use("/api/quota", quotaRouter);
app.use("/api/stripe", stripeRouter);
app.use("/api/refill-chapim", refillRouter);

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API running");
});
