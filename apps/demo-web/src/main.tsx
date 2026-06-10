import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@arco-design/web-react/dist/css/arco.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  // 如果 HTML 模板缺少根节点，立即抛出错误，避免页面空白且难以排查。
  throw new Error("缺少前端应用挂载节点 root");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
