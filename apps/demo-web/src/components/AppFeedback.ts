import { Message } from "@arco-design/web-react";
import { ApiClientError, describeApiErrorCode } from "../api/client";

const fallbackClientErrorMessage = "操作失败，请稍后重试。";

export type AppFormattedError = {
  code: string;
  message: string;
  status?: number;
};

export type AppToastType = "success" | "warning" | "error" | "info";

export type AppToastInput = {
  type: AppToastType;
  content: string;
};

export type AppToastAdapter = Record<AppToastType, (content: string) => unknown>;

export const arcoToastAdapter: AppToastAdapter = {
  success: (content) => Message.success(content),
  warning: (content) => Message.warning(content),
  error: (content) => Message.error(content),
  info: (content) => Message.info(content)
};

export function formatAppError(error: unknown): AppFormattedError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: describeApiErrorCode(error.code),
      status: error.status
    };
  }

  if (error instanceof Error) {
    return {
      code: "CLIENT_ERROR",
      message: error.message || fallbackClientErrorMessage
    };
  }

  return {
    code: "CLIENT_ERROR",
    message: fallbackClientErrorMessage
  };
}

export function showAppToast(adapter: AppToastAdapter, toast: AppToastInput) {
  adapter[toast.type](toast.content);
}
