import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerSecurityHeaders } from "./security.middleware";

describe("security middleware", () => {
  async function createServer() {
    const server = Fastify();
    await registerSecurityHeaders(server);
    server.get("/test", async () => ({ ok: true }));
    return server;
  }

  it("应返回 X-Content-Type-Options: nosniff", async () => {
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    await server.close();
  });

  it("应返回 X-Frame-Options: DENY", async () => {
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-frame-options"]).toBe("DENY");
    await server.close();
  });

  it("应返回 Referrer-Policy", async () => {
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    await server.close();
  });

  it("应返回 X-XSS-Protection", async () => {
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-xss-protection"]).toBe("1; mode=block");
    await server.close();
  });

  it("应返回 Content-Security-Policy", async () => {
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    await server.close();
  });

  it("非生产环境不应返回 Strict-Transport-Security", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const server = await createServer();
    const res = await server.inject({ method: "GET", url: "/test" });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    await server.close();
    process.env.NODE_ENV = original;
  });
});
