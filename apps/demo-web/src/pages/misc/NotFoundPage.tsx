import { Button, Card, Space } from "@arco-design/web-react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home, SearchX } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="app-page centered-page">
      <Card className="panel narrow-panel not-found-panel">
        <div className="not-found-icon" aria-hidden="true">
          <SearchX size={32} />
        </div>
        <div className="u-stack">
          <h1>页面不存在</h1>
          <p className="page-subtle-note">当前路径没有对应的医疗演示页面。</p>
        </div>
        <Space wrap>
          <Link to="/">
            <Button type="primary" icon={<Home size={16} aria-hidden="true" />}>
              识别看板
            </Button>
          </Link>
          <Link to="/recognition/new">
            <Button type="outline" icon={<ArrowLeft size={16} aria-hidden="true" />}>
              新建识别
            </Button>
          </Link>
        </Space>
      </Card>
    </main>
  );
}
