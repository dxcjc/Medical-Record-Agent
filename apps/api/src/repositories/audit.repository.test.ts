import { AuditResult } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createAuditRepository } from "./audit.repository";

describe("audit.repository", () => {
  it("写入审计日志时应仅处理安全后的字段，并保留 actor 与资源信息", async () => {
    const auditLog = {
      create: vi.fn().mockResolvedValue({
        id: "audit-001",
        action: "auth.login",
        result: AuditResult.success
      })
    };

    const repository = createAuditRepository({ auditLog } as never);
    await repository.create({
      actorUserId: "user-001",
      action: "auth.login",
      objectType: "session",
      objectId: "session-001",
      result: AuditResult.success,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      metadata: {
        method: "password"
      }
    });

    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user-001",
        action: "auth.login",
        objectType: "session",
        objectId: "session-001",
        result: AuditResult.success,
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        metadata: {
          method: "password"
        }
      }),
      select: {
        id: true,
        action: true,
        objectType: true,
        objectId: true,
        result: true
      }
    });
  });

  it("按 actor action 与时间查询最近记录时应倒序返回并限制数量", async () => {
    const createdFrom = new Date("2026-06-01T00:00:00.000Z");
    const createdTo = new Date("2026-06-04T23:59:59.999Z");
    const auditLog = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "audit-003",
          action: "auth.login",
          createdAt: new Date("2026-06-04T20:00:00.000Z")
        }
      ])
    };

    const repository = createAuditRepository({ auditLog } as never);
    await repository.listRecent({
      actorUserId: "user-001",
      action: "auth.login",
      createdFrom,
      createdTo,
      take: 20
    });

    expect(auditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorUserId: "user-001",
        action: "auth.login",
        createdAt: {
          gte: createdFrom,
          lte: createdTo
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });
  });
});
