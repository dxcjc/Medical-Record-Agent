import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="app-page centered-page">
      <section className="panel narrow-panel">
        <p className="eyebrow">404</p>
        <h1>页面不存在</h1>
        <p>当前路径没有对应的演示页面。</p>
        <Link className="secondary-button" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          返回 Dashboard
        </Link>
      </section>
    </main>
  );
}
