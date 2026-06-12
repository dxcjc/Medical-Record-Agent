import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import { ConfigProvider } from '@arco-design/web-react';
import AppThemeProvider from './theme/AppThemeProvider';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import JobListPage from './pages/JobListPage';
import JobDetailPage from './pages/JobDetailPage';
import NewRecognitionPage from './pages/NewRecognitionPage';
import SchemaPage from './pages/SchemaPage';
import ProviderPage from './pages/ProviderPage';
import EvaluationPage from './pages/EvaluationPage';
import AuditPage from './pages/AuditPage';
import { useAuthStore } from './stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="jobs" element={<JobListPage />} />
              <Route path="jobs/:id" element={<JobDetailPage />} />
              <Route path="recognition/new" element={<NewRecognitionPage />} />
              <Route path="schemas" element={<SchemaPage />} />
              <Route path="providers" element={<ProviderPage />} />
              <Route path="evaluation" element={<EvaluationPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}
