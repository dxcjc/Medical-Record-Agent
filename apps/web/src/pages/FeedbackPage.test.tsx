import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import FeedbackPage from './FeedbackPage';

// Mock API client
vi.mock('../api/client', () => ({
  feedbackApi: {
    listAll: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getFieldStats: vi.fn().mockResolvedValue({ stats: [] }),
    submit: vi.fn(),
    listByJob: vi.fn(),
  },
  schemasApi: {
    list: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

describe('FeedbackPage', () => {
  it('should render without crashing', () => {
    renderWithProviders(<FeedbackPage />);
    expect(screen.getByText('反馈管理')).toBeInTheDocument();
  });

  it('should display KPI metric cards', () => {
    renderWithProviders(<FeedbackPage />);
    expect(screen.getByText('总反馈数')).toBeInTheDocument();
    expect(screen.getByText('反馈字段数')).toBeInTheDocument();
    expect(screen.getByText('最常反馈字段')).toBeInTheDocument();
  });

  it('should show empty state when no feedback', async () => {
    renderWithProviders(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('暂无反馈记录')).toBeInTheDocument();
    });
  });

  it('should render filter controls', () => {
    renderWithProviders(<FeedbackPage />);
    expect(screen.getByText('刷新')).toBeInTheDocument();
  });
});
