import { FormEvent, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, Space, Tag } from "@arco-design/web-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { ApiClientError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

const demoEmail = "admin.dev@example.local";
const demoPassword = "ChangeMe123!";

type DemoAuthEnv = {
  readonly [key: string]: string | boolean | undefined;
};

export function isDemoAuthPrefillEnabled(env: DemoAuthEnv = import.meta.env) {
  return env.DEV === true || env.MODE === "development" || env.VITE_DEMO_AUTH_ENABLED === "true" || env.VITE_DEMO_MODE === "true";
}

export function getInitialLoginCredentials(env: DemoAuthEnv = import.meta.env) {
  if (!isDemoAuthPrefillEnabled(env)) {
    return {
      email: "",
      password: ""
    };
  }

  return {
    email: demoEmail,
    password: demoPassword
  };
}

type LocationState = {
  from?: string;
};

function readRedirectPath(state: unknown) {
  if (state && typeof state === "object" && "from" in state) {
    const from = (state as LocationState).from;
    if (typeof from === "string" && from.startsWith("/")) {
      return from;
    }
  }

  return "/";
}

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialCredentials = getInitialLoginCredentials();
  const demoPrefillEnabled = isDemoAuthPrefillEnabled();
  const [email, setEmail] = useState(initialCredentials.email);
  const [password, setPassword] = useState(initialCredentials.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email, password });
      navigate(readRedirectPath(location.state), { replace: true });
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "登录失败：请确认 API 服务已启动。";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-layout">
        <Card className="login-hero">
          <div className="brand-lockup brand-lockup-large">
            <div className="brand-mark" aria-hidden="true">
              <ShieldCheck size={22} />
            </div>
            <div>
              <strong>病历识别 Agent</strong>
              <span>Clinical AI Studio</span>
            </div>
          </div>
          <div>
            <Tag color="arcoblue">医疗 AI 运营工作台</Tag>
            <h1>面向病历 OCR、结构化抽取、评测与写回的企业级控制台</h1>
            <p>统一管理 Schema、Provider、证据链、人工复核和审计追踪，让临床数据处理流程保持可解释、可回滚、可审计。</p>
          </div>
          <div className="login-preview">
            <div className="login-preview-item">
              <span className="page-subtle-note">今日识别</span>
              <strong>128</strong>
              <Tag color="green">运行正常</Tag>
            </div>
            <div className="login-preview-item">
              <span className="page-subtle-note">复核队列</span>
              <strong>17</strong>
              <Tag color="orange">需人工确认</Tag>
            </div>
            <div className="login-preview-item">
              <span className="page-subtle-note">Schema 版本</span>
              <strong>v2.4</strong>
              <Tag color="arcoblue">生产生效</Tag>
            </div>
          </div>
        </Card>

        <Card className="login-card">
          <form className="login-form" onSubmit={handleSubmit}>
            <header>
              <p className="eyebrow">Secure Access</p>
              <h2>登录临床工作台</h2>
              <p className="page-subtle-note">使用演示账号进入医疗 AI 识别与运维环境。</p>
            </header>
            {demoPrefillEnabled ? (
              <Alert type="info" showIcon content="当前为开发/demo 环境，已预填演示账号；生产构建不会预填默认凭据。" />
            ) : null}

            <Form.Item label="邮箱">
              <Input
                autoComplete="email"
                name="email"
                type="email"
                value={email}
                onChange={setEmail}
              />
            </Form.Item>

            <Form.Item label="密码">
              <Input.Password
                autoComplete="current-password"
                name="password"
                value={password}
                onChange={setPassword}
              />
            </Form.Item>

            <div className="login-security-row">
              <Checkbox checked>记住安全设备</Checkbox>
              <Space size={6}>
                <LockKeyhole size={14} aria-hidden="true" />
                <span>权限与审计开启</span>
              </Space>
            </div>

            {error ? <Alert type="error" showIcon content={error} /> : null}

            <Button className="login-submit" type="primary" htmlType="submit" loading={loading} icon={<LogIn size={16} aria-hidden="true" />}>
              进入工作台
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
