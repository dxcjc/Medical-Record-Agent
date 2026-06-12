import ConfigProvider from "@arco-design/web-react/es/ConfigProvider";
import zhCN from "@arco-design/web-react/es/locale/zh-CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DatasetSpecPage = lazy(() => import("./pages/misc/DatasetSpecPage"));
const NotFoundPage = lazy(() => import("./pages/misc/NotFoundPage"));
const EvaluationPage = lazy(() => import("./pages/evaluation/EvaluationPage"));
const AgentTracePage = lazy(() => import("./pages/operations/AgentTracePage"));
const AuditLogPage = lazy(() => import("./pages/operations/AuditLogPage"));
const FeedbackSamplesPage = lazy(() => import("./pages/operations/FeedbackSamplesPage"));
const ProviderSettingsPage = lazy(() => import("./pages/operations/ProviderSettingsPage"));
const WritebackPage = lazy(() => import("./pages/operations/WritebackPage"));
const JobDetailPage = lazy(() => import("./pages/recognition/JobDetailPage"));
const NewRecognitionPage = lazy(() => import("./pages/recognition/NewRecognitionPage"));
const RecognitionDashboardPage = lazy(() => import("./pages/recognition/RecognitionDashboardPage"));
const SchemaStudioPage = lazy(() => import("./pages/schema/SchemaStudioPage"));
const DataManagementPage = lazy(() => import("./pages/data/DataManagementPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));

const queryClient = new QueryClient();
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "");

function RouteLoadingFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      页面加载中...
    </div>
  );
}

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
          {
            path: "data",
            element: <DataManagementPage />,
            children: [
              { index: true, element: <Navigate to="schema" replace /> },
              { path: "schema", element: <SchemaStudioPage /> },
              { path: "evaluation", element: <EvaluationPage /> },
              { path: "feedback", element: <FeedbackSamplesPage /> },
              { path: "trace", element: <AgentTracePage /> },
              { path: "audit", element: <AuditLogPage /> },
              { path: "writeback", element: <WritebackPage /> },
              { path: "docs", element: <DatasetSpecPage /> },
            ]
          },
          {
            path: "settings",
            element: <SettingsPage />,
            children: [
              { index: true, element: <Navigate to="providers" replace /> },
              { path: "providers", element: <ProviderSettingsPage /> },
            ]
          },
          // Keep old routes for backward compatibility
          { path: "schema", element: <Navigate to="/data/schema" replace /> },
          { path: "evaluation", element: <Navigate to="/data/evaluation" replace /> },
          { path: "feedback", element: <Navigate to="/data/feedback" replace /> },
          { path: "providers", element: <Navigate to="/settings/providers" replace /> },
          { path: "writeback", element: <Navigate to="/data/writeback" replace /> },
          { path: "trace", element: <Navigate to="/data/trace" replace /> },
          { path: "audit", element: <Navigate to="/data/audit" replace /> },
          { path: "docs", element: <Navigate to="/data/docs" replace /> },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ]
  }
], routerBasename ? {
  basename: routerBasename
} : undefined);

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        primaryColor: "#3370FF"
      }}
      componentConfig={{
        Button: { size: "default" },
        Card: { bordered: false },
        Input: { size: "default" },
        Select: { size: "default" },
        Table: { border: false }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

export default App;
