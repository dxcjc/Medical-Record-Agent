import { Message } from '@arco-design/web-react';

// Configure Message defaults
Message.config({
  maxCount: 3,
});

export const toast = {
  success: (content: string) => {
    Message.success({ content, duration: 3000 });
  },
  error: (content: string) => {
    Message.error({ content, duration: 5000 });
  },
  warning: (content: string) => {
    Message.warning({ content, duration: 4000 });
  },
  info: (content: string) => {
    Message.info({ content, duration: 3000 });
  },
};

/**
 * GlobalToast is a no-op wrapper component for mounting in App.tsx.
 * The side effect of calling Message.config() above runs on import,
 * so the main export is the `toast` utility object.
 */
export default function GlobalToast() {
  return null;
}
