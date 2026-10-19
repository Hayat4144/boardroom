import { Router } from "express";
import { currentUser } from "../auth/middleware";

export function meRouter() {
  const router = Router();
  router.get("/me", (req, res) => {
    res.json({ user: currentUser(req) });
  });
  return router;
}
