import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase.js";
import type { User } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      user: User | null;
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  req.user = error ? null : user;
  next();
}
