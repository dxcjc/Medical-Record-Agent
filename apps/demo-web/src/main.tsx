import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import LoginPage from "./pages/auth/LoginPage";
import DatasetSpecPage from "./pages/misc/DatasetSpecPage";
import NotFoundPage from "./pages/misc/NotFoundPage";
import EvaluationPage from "./pages/evaluation/EvaluationPage";
import AgentTracePage from "./pages/operations/AgentTracePage";
import AuditLogPage from "./pages/operations/AuditLogPage";
import FeedbackSamplesPage from "./pages/operations/FeedbackSamplesPage";
import ProviderSettingsPage from "./pages/operations/ProviderSettingsPage";
import WritebackPage from "./pages/operations/WritebackPage";
import JobDetailPage from "./pages/recognition/JobDetailPage";
import NewRecognitionPage from "./pages/recognition/NewRecognitionPage";
import RecognitionDashboardPage from "./pages/recognition/RecognitionDashboardPage";
import SchemaStudioPage from "./pages/schema/SchemaStudioPage";
import "./styles.css";

const queryClient = new QueryClient();
const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <RecognitionDashboardPage /> },
          { path: "recognition/new", element: <NewRecognitionPage /> },
          { path: "recognition/jobs/:jobId", element: <JobDetailPage /> },
          { path: "schema", element: <SchemaStudioPage /> },
          { path: "evaluation", element: <EvaluationPage /> },
          { path: "feedback", element: <FeedbackSamplesPage /> },
          { path: "providers", element: <ProviderSettingsPage /> },
          { path: "writeback", element: <WritebackPage /> },
          { path: "trace", element: <AgentTracePage /> },
          { path: "audit", element: <AuditLogPage /> },
          { path: "docs", element: <DatasetSpecPage /> },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ]
  }
]);

const rootElement = document.getElementById("root");

if (!rootElement) {
  // 如果 HTML 模板缺少根节点，立即抛出错误，避免页面空白且难以排查。
  throw new Error("缺少前端应用挂载节点 root");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
