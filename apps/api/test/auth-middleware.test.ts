import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRequireAuth, requireAdmin, type SessionUser } from "../src/auth/middleware";
import { errorHandler } from "../src/lib/http";

const alice: SessionUser = { id: "u1", email: "a@test.dev", name: "Alice", role: "user" };
const admin: SessionUser = { id: "u2", email: "b@test.dev", name: "Bob", role: "admin" };

function app() {
  const a = express();
  const requireAuth = createRequireAuth(
    async (req) => [alice, admin].find((u) => u.id === req.header("x-test-user")) ?? null,
  );
  a.get("/private", requireAuth, (req, res) => {
    res.json({ id: req.user?.id });
  });
  a.get("/admin", requireAuth, requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  a.get("/admin-no-auth", requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  a.use(errorHandler);
  return a;
}

describe("requireAuth", () => {
  it("rejects requests without a session", async () => {
    const res = await request(app()).get("/private");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Sign in required" });
  });

  it("attaches the session user", async () => {
    const res = await request(app()).get("/private").set("x-test-user", "u1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "u1" });
  });

  it("propagates session lookup failures as 500", async () => {
    const a = express();
    a.get(
      "/x",
      createRequireAuth(async () => {
        throw new Error("db down");
      }),
      (_req, res) => {
        res.end();
      },
    );
    a.use(errorHandler);
    const res = await request(a).get("/x");
    expect(res.status).toBe(500);
  });
});

describe("requireAdmin", () => {
  it("forbids non-admin users", async () => {
    const res = await request(app()).get("/admin").set("x-test-user", "u1");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("allows admins", async () => {
    const res = await request(app()).get("/admin").set("x-test-user", "u2");
    expect(res.status).toBe(200);
  });

  it("returns 401 when used without requireAuth", async () => {
    const res = await request(app()).get("/admin-no-auth");
    expect(res.status).toBe(401);
  });
});
