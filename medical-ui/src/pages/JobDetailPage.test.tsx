import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import JobDetailPage from './JobDetailPage';

// Mock hooks
vi.mock('../hooks/useJobs', () => ({
  useJob: vi.fn().mockReturnValue({
    data: {
      id: 'job-123',
      status: 'completed',
      schemaKey: 'test-schema',
      trace: [
        { node: 'ocr', status: 'completed', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:01Z', duration: 1000 },
        { node: 'extraction', status: 'completed', startedAt: '2026-01-01T00:00:01Z', completedAt: '2026-01-01T00:00:03Z', duration: 2000 },
      ],
      sourceFile: { originalName: 'test.pdf', byteSize: '1024', mimeType: 'application/pdf' },
      createdAt: '2026-01-01T00:00:00Z',
      providerConfig: {},
      options: {},
      warnings: [],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../hooks/useResults', () => ({
  useResult: vi.fn().mockReturnValue({
    data: {
      id: 'result-123',
      jobId: 'job-123',
      fields: { patientName: '张三' },
      normalizedFields: {},
      evidence: [],
      payload: {
        ocr: { provider: 'tesseract' },
        extraction: { provider: 'gpt-4', model: 'gpt-4', tokens: { prompt: 100, completion: 50 } },
        validation: { fields: [] },
      },
      reviewRequired: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
  }),
}));

vi.mock('../hooks/useSchemas', () => ({
  useSchemas: vi.fn().mockReturnValue({
    data: { items: [] },
  }),
}));

vi.mock('../api/client', () => ({
  feedbackApi: {
    submit: vi.fn(),
  },
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'job-123' }),
    useNavigate: () => mockNavigate,
  };
});

describe('JobDetailPage - TraceView', () => {
  it('should render the page with trace tab', async () => {
    renderWithProviders(<JobDetailPage />, { route: '/jobs/job-123' });
    // Verify the page rendered (default tab content)
    await waitFor(() => {
      expect(screen.getByText('追溯链路')).toBeInTheDocument();
    });
  });

  it('should render trace nodes when trace tab is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<JobDetailPage />, { route: '/jobs/job-123' });
    // Click on the trace tab
    await waitFor(() => {
      expect(screen.getByText('追溯链路')).toBeInTheDocument();
    });
    await user.click(screen.getByText('追溯链路'));
    // Now trace nodes should be visible
    await waitFor(() => {
      expect(screen.getByText('原始文件')).toBeInTheDocument();
    });
  });

  it('should display source file info in trace view', async () => {
    const user = userEvent.setup();
    renderWithProviders(<JobDetailPage />, { route: '/jobs/job-123' });
    await waitFor(() => {
      expect(screen.getByText('追溯链路')).toBeInTheDocument();
    });
    await user.click(screen.getByText('追溯链路'));
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });
});
