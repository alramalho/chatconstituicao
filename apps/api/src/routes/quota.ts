import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { checkQuota } from "../services/quota.js";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  const quota = await checkQuota(
    req.user?.id ?? null,
    req.ip ?? "unknown"
  );
  res.json(quota);
});

export default router;
