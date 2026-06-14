import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import WritebackPage from './WritebackPage';

// Mock API client
vi.mock('../api/client', () => ({
  writebackApi: {
    eligible: vi.fn().mockResolvedValue({ items: [] }),
    execute: vi.fn(),
    history: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('WritebackPage', () => {
  it('should render without crashing', () => {
    renderWithProviders(<WritebackPage />);
    expect(screen.getByText('回写管理')).toBeInTheDocument();
  });

  it('should display tab navigation', () => {
    renderWithProviders(<WritebackPage />);
    expect(screen.getByText('可回写任务')).toBeInTheDocument();
    expect(screen.getByText('回写历史')).toBeInTheDocument();
  });

  it('should show empty state for eligible tasks', async () => {
    renderWithProviders(<WritebackPage />);
    await waitFor(() => {
      expect(screen.getByText('暂无可回写任务')).toBeInTheDocument();
    });
  });
});
