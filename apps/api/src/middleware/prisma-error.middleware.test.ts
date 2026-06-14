import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { isPrismaError, handlePrismaError } from "./prisma-error.middleware";

function createPrismaKnownRequestError(
  code: string,
  meta?: Record<string, unknown>
): Prisma.PrismaClientKnownRequestError {
  const params: { code: string; clientVersion: string; meta?: Record<string, unknown> } = {
    code,
    clientVersion: "5.0.0"
  };
  if (meta !== undefined) {
    params.meta = meta;
  }
  return new Prisma.PrismaClientKnownRequestError("test error", params);
}

describe("isPrismaError", () => {
  it("对 PrismaClientKnownRequestError 返回 true", () => {
    const error = createPrismaKnownRequestError("P2002", { target: ["email"] });
    expect(isPrismaError(error)).toBe(true);
  });

  it("对普通 Error 返回 false", () => {
    expect(isPrismaError(new Error("something"))).toBe(false);
  });

  it("对 null 返回 false", () => {
    expect(isPrismaError(null)).toBe(false);
  });

  it("对 undefined 返回 false", () => {
    expect(isPrismaError(undefined)).toBe(false);
  });

  it("对字符串返回 false", () => {
    expect(isPrismaError("error string")).toBe(false);
  });
});

describe("handlePrismaError", () => {
  describe("P2002 — unique constraint violation", () => {
    it("返回 409 CONFLICT 并包含字段名", () => {
      const error = createPrismaKnownRequestError("P2002", { target: ["email", "tenantId"] });
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(409);
      expect(result!.code).toBe("CONFLICT");
      expect(result!.message).toContain("email");
      expect(result!.message).toContain("tenantId");
    });

    it("当 target 为数组时正确拼接", () => {
      const error = createPrismaKnownRequestError("P2002", { target: ["username"] });
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("Unique constraint failed on: username");
    });

    it("当 meta.target 缺失时使用 unknown", () => {
      const error = createPrismaKnownRequestError("P2002");
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(409);
      expect(result!.message).toContain("unknown");
    });

    it("当 target 非数组时使用 unknown", () => {
      const error = createPrismaKnownRequestError("P2002", { target: "email" });
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.message).toContain("unknown");
    });
  });

  describe("P2003 — foreign key constraint violation", () => {
    it("返回 400 BAD_REQUEST", () => {
      const error = createPrismaKnownRequestError("P2003", {
        field_name: "userId"
      });
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(400);
      expect(result!.code).toBe("BAD_REQUEST");
    });
  });

  describe("P2025 — record not found", () => {
    it("返回 404 NOT_FOUND 并使用 cause", () => {
      const error = createPrismaKnownRequestError("P2025", {
        cause: "Record to update not found"
      });
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(404);
      expect(result!.code).toBe("NOT_FOUND");
      expect(result!.message).toBe("Record to update not found");
    });

    it("当 cause 缺失时使用默认消息", () => {
      const error = createPrismaKnownRequestError("P2025");
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(404);
      expect(result!.message).toBe("Record not found");
    });
  });

  describe("其他 Prisma 错误码", () => {
    it("P2000 等其他错误返回 500 INTERNAL_ERROR", () => {
      const error = createPrismaKnownRequestError("P2000");
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(500);
      expect(result!.code).toBe("INTERNAL_ERROR");
      expect(result!.message).toContain("P2000");
    });

    it("P2014 返回 500", () => {
      const error = createPrismaKnownRequestError("P2014");
      const result = handlePrismaError(error);

      expect(result).not.toBeNull();
      expect(result!.statusCode).toBe(500);
      expect(result!.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("非 Prisma 错误", () => {
    it("对普通 Error 返回 null", () => {
      expect(handlePrismaError(new Error("boom"))).toBeNull();
    });

    it("对对象返回 null", () => {
      expect(handlePrismaError({ code: "P2002", message: "fake" })).toBeNull();
    });

    it("对 null 返回 null", () => {
      expect(handlePrismaError(null)).toBeNull();
    });

    it("对 undefined 返回 null", () => {
      expect(handlePrismaError(undefined)).toBeNull();
    });
  });
});
