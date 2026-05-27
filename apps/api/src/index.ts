import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT ?? 3088;

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? "http://localhost:5188")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/chat", chatRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
