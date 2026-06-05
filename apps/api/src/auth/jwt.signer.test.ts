import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { describe, expect, it } from "vitest";

import { createFastifyJwtSigner } from "./jwt.signer";

describe("jwt signer", () => {
  it("使用 Fastify JWT 签发并校验认证 payload", async () => {
    const server = Fastify();
    await server.register(jwt, {
      secret: "test-secret-with-more-than-32-characters"
    });
    const signer = createFastifyJwtSigner(server, { expiresIn: "1h" });

    const token = await signer.sign({
      sub: "user-001",
      permissions: ["job:read"],
      roles: ["reviewer"],
      authType: "jwt"
    });
    const payload = await signer.verify(token);

    expect(payload).toMatchObject({
      sub: "user-001",
      permissions: ["job:read"],
      roles: ["reviewer"],
      authType: "jwt"
    });
  });
});
