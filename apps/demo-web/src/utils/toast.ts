import { Message } from '@arco-design/web-react';

export function showError(msg: string) {
  Message.error(msg);
}

export function showSuccess(msg: string) {
  Message.success(msg);
}

export function showWarning(msg: string) {
  Message.warning(msg);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请稍后重试';
}
