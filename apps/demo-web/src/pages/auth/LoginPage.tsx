import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { ApiClientError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

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
  const [email, setEmail] = useState("demo@example.local");
  const [password, setPassword] = useState("ChangeMe123!");
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
          ? `登录失败：${caughtError.code}`
          : "登录失败：请确认 API 服务已启动。";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-lockup brand-lockup-large">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={24} />
          </div>
          <div>
            <strong>Medical Record Agent</strong>
            <span>Clinical Studio</span>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <header>
            <p className="eyebrow">Demo Access</p>
            <h1>登录工作台</h1>
          </header>

          <label>
            邮箱
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            密码
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <div className="form-error" role="alert">
              <LockKeyhole size={16} aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <button className="action-button action-button-wide" type="submit" disabled={loading}>
            <LogIn size={17} aria-hidden="true" />
            {loading ? "登录中" : "进入工作台"}
          </button>
        </form>
      </section>
    </main>
  );
}
