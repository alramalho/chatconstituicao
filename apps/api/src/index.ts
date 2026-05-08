import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";
import quotaRouter from "./routes/quota.js";
import stripeRouter from "./routes/stripe.js";
import refillRouter from "./routes/refill.js";

const app = express();
const PORT = process.env.PORT ?? 3088;

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5188" }));

// Stripe webhook needs raw body — must come before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/chat", chatRouter);
app.use("/api/quota", quotaRouter);
app.use("/api/stripe", stripeRouter);
app.use("/api/refill-chapim", refillRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
