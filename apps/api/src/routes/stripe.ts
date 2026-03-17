import { Router } from "express";
import { stripe } from "../lib/stripe.js";
import { authMiddleware } from "../middleware/auth.js";
import { addQuota } from "../services/quota.js";
import type Stripe from "stripe";

const router = Router();

router.post("/create-checkout", authMiddleware, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: "50 perguntas — Chat Constituição" },
          unit_amount: 500,
        },
        quantity: 1,
      },
    ],
    metadata: { userId: req.user.id },
    success_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}?payment=success`,
    cancel_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}?payment=cancel`,
  });

  res.json({ url: session.url });
});

// Body already parsed as raw by app-level middleware for /api/stripe/webhook
router.post("/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch {
      res.status(400).send("Webhook signature verification failed");
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId) {
        await addQuota(userId, 50);
      }
    }

    res.json({ received: true });
  }
);

export default router;
