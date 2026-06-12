import { useCallback } from "react";
import { Message } from "@arco-design/web-react";
import { ApiClientError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/** HTTP 状态码 → 中文友好消息 */
const STATUS_MESSAGES: Record<number, string> = {
  400: "请求参数错误，请检查输入",
  401: "登录已过期，请重新登录",
  403: "没有权限执行此操作",
  404: "请求的资源不存在",
  429: "请求过于频繁，请稍后重试",
  500: "服务器错误，请稍后重试",
  502: "服务暂时不可用，请稍后重试",
  503: "服务暂时不可用，请稍后重试",
};

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === "Failed to fetch";
}

/** 从错误对象中提取用户可读的中文提示 */
export function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "网络连接失败，请检查网络";
  }

  if (error instanceof ApiClientError) {
    // ApiClientError.message 已经是 describeApiErrorCode 映射后的中文
    if (error.message && error.message !== error.code) {
      return error.message;
    }
    return STATUS_MESSAGES[error.status] ?? `请求失败（${error.status}）`;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}

/**
 * 统一 API 错误 toast 处理 hook。
 *
 * - 调用 `handleError(error)` 即可弹出 Arco Message.error
 * - 401 自动清 token 并跳转登录页
 * - 返回包装后的 try-catch 辅助函数 `withToast`
 */
export function useApiToast() {
  const { logout } = useAuth();

  const handleError = useCallback(
    (error: unknown) => {
      const message = getErrorMessage(error);

      // 401 自动清 token 跳登录
      if (error instanceof ApiClientError && error.status === 401) {
        Message.warning(message);
        void logout();
        return;
      }

      Message.error(message);
    },
    [logout]
  );

  /**
   * 包装异步调用，自动 catch 并弹 toast。
   *
   * ```ts
   * const data = await withToast(api.getJob(id));
   * ```
   */
  const withToast = useCallback(
    async <T>(promise: Promise<T>): Promise<T | undefined> => {
      try {
        return await promise;
      } catch (error) {
        handleError(error);
        return undefined;
      }
    },
    [handleError]
  );

  /**
   * 包装异步调用，成功时弹 success toast，失败弹 error toast。
   */
  const withToastAndSuccess = useCallback(
    async <T>(promise: Promise<T>, successMessage: string): Promise<T | undefined> => {
      try {
        const result = await promise;
        Message.success(successMessage);
        return result;
      } catch (error) {
        handleError(error);
        return undefined;
      }
    },
    [handleError]
  );

  return { handleError, withToast, withToastAndSuccess, getErrorMessage };
}
