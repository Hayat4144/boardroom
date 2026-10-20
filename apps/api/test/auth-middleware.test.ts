import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../src/auth/auth";
import { requireAdmin, requireAuth } from "../src/auth/middleware";
import { errorHandler } from "../src/http";

const getSessionUser = vi.hoisted(() => vi.fn());
vi.mock("../src/auth/auth", () => ({ getSessionUser }));

const alice: SessionUser = { id: "u1", email: "a@test.dev", name: "Alice", role: "user" };
const admin: SessionUser = { id: "u2", email: "b@test.dev", name: "Bob", role: "admin" };

beforeEach(() => {
  getSessionUser.mockImplementation(
    async (req) => [alice, admin].find((u) => u.id === req.header("x-test-user")) ?? null,
  );
});

const app = express();
app.get("/private", requireAuth, (req, res) => void res.json({ id: req.user?.id }));
app.get("/admin", requireAuth, requireAdmin, (_req, res) => void res.json({ ok: true }));

app.get("/admin-no-auth", requireAdmin, (_req, res) => void res.json({ ok: true }));
app.use(errorHandler);

describe("requireAuth", () => {
  it("rejects requests without a session", async () => {
    const res = await request(app).get("/private");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Sign in required" });
  });

  it("attaches the session user", async () => {
    const res = await request(app).get("/private").set("x-test-user", "u1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "u1" });
  });

  it("propagates session lookup failures as 500", async () => {
    getSessionUser.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/private");

    expect(res.status).toBe(500);
  });
});

describe("requireAdmin", () => {
  it("forbids non-admin users", async () => {
    const res = await request(app).get("/admin").set("x-test-user", "u1");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("allows admins", async () => {
    const res = await request(app).get("/admin").set("x-test-user", "u2");
    expect(res.status).toBe(200);
  });

  it("returns 401 when used without requireAuth", async () => {
    const res = await request(app).get("/admin-no-auth");
    expect(res.status).toBe(401);
  });
});
