import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { resetQuota } from "../services/quota.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  await resetQuota(req.user?.id ?? null, req.ip ?? "unknown");
  res.json({ ok: true });
});

export default router;
