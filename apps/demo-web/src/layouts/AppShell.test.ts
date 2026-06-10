import { describe, expect, it } from "vitest";

import {
  markAllNotificationsRead,
  markNotificationRead,
  openNotificationTarget,
  countUnreadNotifications,
  type AppNotification,
  describeTopbarProviderStatus,
  findNavigationSearchTarget,
  type NavigationSearchItem
} from "./AppShell";

describe("AppShell navigation search", () => {
  const items: NavigationSearchItem[] = [
    {
      to: "/schema",
      label: "Schema 管理",
      keywords: ["Operations", "schema:read", "/schema"]
    },
    {
      to: "/writeback",
      label: "写回控制",
      keywords: ["Operations", "writeback:execute", "/writeback"]
    }
  ];

  it("按页面标签或权限关键词解析到真实路由", () => {
    expect(findNavigationSearchTarget("schema", items)).toEqual(items[0]);
    expect(findNavigationSearchTarget("writeback:execute", items)).toEqual(items[1]);
  });

  it("空搜索和无匹配搜索不会返回假目标", () => {
    expect(findNavigationSearchTarget("", items)).toBeNull();
    expect(findNavigationSearchTarget("不存在页面", items)).toBeNull();
  });
});

describe("AppShell notifications", () => {
  const notifications: AppNotification[] = [
    {
      id: "writeback-review",
      title: "写回任务等待确认",
      detail: "进入写回控制查看 green 条件。",
      route: "/writeback",
      tone: "warning"
    },
    {
      id: "schema-risk",
      title: "Schema 生产变更需确认",
      detail: "执行前需要二次确认。",
      route: "/schema",
      tone: "danger"
    }
  ];

  it("通知标记已读是幂等操作，并准确计算未读数", () => {
    const nextReadIds = markNotificationRead(["schema-risk"], "schema-risk");

    expect(nextReadIds).toEqual(["schema-risk"]);
    expect(countUnreadNotifications(notifications, nextReadIds)).toBe(1);
  });

  it("打开通知会返回真实路由并把通知标记为已读", () => {
    const notification = notifications[0];

    if (!notification) {
      throw new Error("测试缺少通知样本");
    }

    expect(openNotificationTarget(notification, [])).toEqual({
      route: "/writeback",
      readNotificationIds: ["writeback-review"]
    });
  });

  it("全部标记已读会覆盖当前通知集合", () => {
    expect(markAllNotificationsRead(notifications)).toEqual(["writeback-review", "schema-risk"]);
  });
});

describe("AppShell provider status", () => {
  it("顶部状态不显示 mock 或开发占位 provider，只显示待配置", () => {
    const status = describeTopbarProviderStatus([
      { key: "mock-ocr", kind: "ocr", displayName: "Mock OCR Provider", enabled: true, isDefault: true, isMock: true },
      { key: "mock-model", kind: "llm", displayName: "Mock Model Provider", enabled: true, isDefault: true, isMock: true }
    ]);

    expect(status.text).not.toBe("Mock Provider Ready");
    expect(status.text).not.toContain("mock");
    expect(status.text).not.toContain("Mock");
    expect(status.text).not.toContain("开发占位");
    expect(status.text).toBe("Provider 待配置");
    expect(status.badgeStatus).toBe("warning");
  });

  it("真实 OCR 和 LLM provider 均已启用时显示已连接状态", () => {
    expect(
      describeTopbarProviderStatus([
        { key: "http-ocr", kind: "ocr", displayName: "HTTP OCR Provider", enabled: true, isDefault: true, isMock: false },
        { key: "openai-responses-model", kind: "llm", displayName: "OpenAI Responses Provider", enabled: true, isDefault: true, isMock: false }
      ])
    ).toEqual({
      badgeStatus: "success",
      text: "Provider 已连接"
    });
  });
});
