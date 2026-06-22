import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import FieldCard from '../components/FieldCard';
import type { SchemaField } from '../api/types';

// Mock knowledge hooks
vi.mock('../hooks/useKnowledge', () => ({
  useKnowledgeList: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useCreateKnowledge: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateKnowledge: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteKnowledge: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mock rule candidate hooks
vi.mock('../hooks/useRuleCandidates', () => ({
  useRuleCandidates: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useReviewCandidate: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useExtractCandidates: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockField: SchemaField = {
  key: 'patientName',
  label: '患者姓名',
  type: 'string',
  required: true,
  description: '患者全名',
  comments: '从送检单中提取',
  adapterHints: { limsTargetPath: 'patient.name' },
};

const mockStats = {
  fieldKey: 'patientName',
  recognitionCount: 120,
  avgConfidence: 0.92,
  reviewCount: 5,
  correctionCount: 3,
  commonErrors: [
    { original: '张三丰', corrected: '张三', count: 2 },
  ],
};

describe('FieldCard', () => {
  it('should render field key and label', () => {
    renderWithProviders(
      <FieldCard field={mockField} schemaKey="test_schema" onUpdate={vi.fn()} />
    );
    expect(screen.getByText('patientName')).toBeInTheDocument();
    expect(screen.getByText('患者姓名')).toBeInTheDocument();
  });

  it('should render field type', () => {
    renderWithProviders(
      <FieldCard field={mockField} schemaKey="test_schema" onUpdate={vi.fn()} />
    );
    expect(screen.getByText('string')).toBeInTheDocument();
  });

  it('should render LIMS target path', () => {
    renderWithProviders(
      <FieldCard field={mockField} schemaKey="test_schema" onUpdate={vi.fn()} />
    );
    expect(screen.getByText('patient.name')).toBeInTheDocument();
  });

  it('should render stats when provided', () => {
    renderWithProviders(
      <FieldCard field={mockField} stats={mockStats} schemaKey="test_schema" onUpdate={vi.fn()} />
    );
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('should render without stats', () => {
    const { container } = renderWithProviders(
      <FieldCard field={mockField} schemaKey="test_schema" onUpdate={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });
});
