import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "../api/client";
import { formatAppError, showAppToast } from "./AppFeedback";

describe("AppFeedback", () => {
  it("formats known API error codes through the central code dictionary", () => {
    expect(formatAppError(new ApiClientError(401, "AUTH_INVALID_CREDENTIALS"))).toEqual({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "账号或密码不正确，请检查后重试。",
      status: 401
    });
  });

  it("formats unknown runtime errors with a stable fallback", () => {
    expect(formatAppError(new Error("network down"))).toEqual({
      code: "CLIENT_ERROR",
      message: "network down"
    });
    expect(formatAppError("broken")).toEqual({
      code: "CLIENT_ERROR",
      message: "操作失败，请稍后重试。"
    });
  });

  it("routes toast calls through a single adapter", () => {
    const adapter = {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    };

    showAppToast(adapter, {
      type: "success",
      content: "已刷新"
    });

    expect(adapter.success).toHaveBeenCalledWith("已刷新");
    expect(adapter.error).not.toHaveBeenCalled();
  });
});
