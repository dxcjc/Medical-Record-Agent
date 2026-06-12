import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Spin,
  Form,
  Input,
  Select,
  Steps,
  Message,
  Grid,
  Descriptions,
  Space,
  Typography,
} from '@arco-design/web-react';
import { useJob } from '../hooks/useJobs';
import { useResult } from '../hooks/useResults';
import { feedbackApi } from '../api/client';
import StatusTag from '../components/StatusTag';
import {
  IconArrowLeft,
  IconRefresh,
  IconFileText,
  IconEye,
} from '../icons/appIcons';
import type { TraceStep, EvidenceItem } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;
const FormItem = Form.Item;
const { Option } = Select;
const { Step } = Steps;

function traceStepStatus(step: TraceStep): 'wait' | 'process' | 'finish' | 'error' {
  if (step.status === 'completed') return 'finish';
  if (step.status === 'failed' || step.error) return 'error';
  if (step.status === 'running') return 'process';
  return 'wait';
}

function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'orange';
  return 'red';
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, error, refetch } = useJob(id!);
  const { data: result, isLoading: resultLoading } = useResult(id!);

  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackField, setFeedbackField] = useState('');
  const [feedbackCorrection, setFeedbackCorrection] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');

  const handleFeedback = async () => {
    if (!feedbackField) {
      Message.warning('请选择字段');
      return;
    }
    setFeedbackLoading(true);
    try {
      await feedbackApi.submit({
        jobId: id,
        fieldKey: feedbackField,
        correction: feedbackCorrection,
        comment: feedbackComment,
      });
      Message.success('反馈提交成功');
      setFeedbackField('');
      setFeedbackCorrection('');
      setFeedbackComment('');
    } catch {
      Message.error('反馈提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  };

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size={40} />
        </div>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p>任务不存在</p>
          <Button onClick={() => navigate('/jobs')}>返回列表</Button>
        </div>
      </Card>
    );
  }

  const fields = result?.fields || {};
  const evidence = result?.evidence || [];
  const trace = job.trace || [];
  const isRunning = ['queued', 'running'].includes(job.status);

  // Extract OCR text from various possible locations
  const ocrText = result?.payload?.ocrText as string
    || result?.payload?.text as string
    || result?.payload?.ocr_text as string
    || (result?.payload?.rawText as string)
    || null;

  // Compute overall confidence
  const confidenceStr = result?.confidence;
  const confidenceNum = confidenceStr ? parseFloat(confidenceStr) : null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          type="text"
          icon={<IconArrowLeft size={16} />}
          onClick={() => navigate('/jobs')}
        >
          返回
        </Button>
        <Text code style={{ fontSize: 14 }}>{job.id}</Text>
        <StatusTag status={job.status} />
      </div>

      <Row gutter={16}>
        {/* Left Column: Progress + Results */}
        <Col span={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Trace Progress */}
            <Card title="识别进度">
              {trace.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)' }}>
                  {isRunning ? '任务正在排队...' : '暂无进度信息'}
                </div>
              ) : (
                <Steps
                  direction="vertical"
                  current={trace.filter((s) => s.status === 'completed').length}
                  style={{ marginLeft: 8 }}
                >
                  {trace.map((step, idx) => (
                    <Step
                      key={idx}
                      title={step.step}
                      description={
                        <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                          {step.startedAt && <span>开始: {formatTime(step.startedAt)}</span>}
                          {step.duration && (
                            <span style={{ marginLeft: 12 }}>
                              耗时: {formatDuration(step.duration)}
                            </span>
                          )}
                          {step.error && (
                            <div style={{ color: 'var(--color-danger)', marginTop: 4 }}>
                              {String(step.error)}
                            </div>
                          )}
                        </div>
                      }
                      status={traceStepStatus(step)}
                    />
                  ))}
                </Steps>
              )}
            </Card>

            {/* Result Loading */}
            {isRunning && !result && (
              <Card>
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Spin size={40} />
                  <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>识别中...</p>
                </div>
              </Card>
            )}

            {/* Recognition Results (Fields) */}
            {result && Object.keys(fields).length > 0 && (
              <Card title={<span><IconEye size={16} style={{ marginRight: 8, verticalAlign: -3 }} />识别结果</span>}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {Object.entries(fields).map(([key, value]) => {
                    const fieldEvidence = evidence.find((e: EvidenceItem) => e.fieldKey === key);
                    const fieldConfidence = fieldEvidence?.confidence;
                    const displayValue = value === null || value === undefined
                      ? '-'
                      : typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value);

                    return (
                      <div className="field-result-item" key={key}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span className="field-result-key">{key}</span>
                            {fieldConfidence != null && (
                              <Tag
                                color={confidenceColor(fieldConfidence)}
                                size="small"
                                style={{ borderRadius: 'var(--radius-tag)' }}
                              >
                                置信度 {(fieldConfidence * 100).toFixed(0)}%
                              </Tag>
                            )}
                          </div>
                          <div className="field-result-value">{displayValue}</div>
                        </div>
                      </div>
                    );
                  })}
                </Space>

                {/* Overall confidence & review status */}
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-info-soft)', borderRadius: 'var(--radius-control)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {confidenceNum != null && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>整体置信度</Text>
                        <div style={{ fontSize: 20, fontWeight: 700, color: confidenceColor(confidenceNum) === 'green' ? 'var(--color-success)' : confidenceColor(confidenceNum) === 'orange' ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                          {(confidenceNum * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                    {result.reviewRequired && (
                      <Tag color="orange" style={{ fontWeight: 600 }}>需要复核</Tag>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </Space>
        </Col>

        {/* Right Column: Job Info + OCR Text + Feedback */}
        <Col span={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Job Info */}
            <Card title="任务信息">
              <Descriptions
                column={1}
                data={[
                  { label: 'Schema', value: job.schemaKey },
                  {
                    label: 'Provider',
                    value:
                      (job.providerConfig?.providerKey as string) ||
                      (job.providerConfig?.ocrProviderKey as string) ||
                      '-',
                  },
                  { label: '创建时间', value: formatTime(job.createdAt) },
                  { label: '更新时间', value: formatTime(job.updatedAt) },
                ]}
              />
            </Card>

            {/* OCR Text - PROMINENT DISPLAY */}
            <Card
              title={
                <span>
                  <IconFileText size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
                  OCR 原始文本
                </span>
              }
            >
              {resultLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Spin />
                </div>
              ) : ocrText ? (
                <div className="ocr-text-container">
                  {ocrText}
                </div>
              ) : result?.payload ? (
                <div className="ocr-text-container">
                  {JSON.stringify(result.payload, null, 2)}
                </div>
              ) : result ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)' }}>
                  暂无 OCR 文本
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)' }}>
                  {isRunning ? '识别中，暂无文本...' : '暂无结果'}
                </div>
              )}
            </Card>

            {/* Evidence */}
            {evidence.length > 0 && (
              <Card title="证据片段">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {evidence.map((item: EvidenceItem, idx: number) => (
                    <Card key={idx} size="small" style={{ background: 'var(--color-info-soft)' }}>
                      {item.fieldKey && (
                        <Tag size="small" style={{ marginBottom: 4 }}>
                          {item.fieldKey}
                        </Tag>
                      )}
                      <div style={{ fontSize: 13 }}>{item.snippet || '-'}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.page && `第 ${item.page} 页`}
                        {item.confidence != null &&
                          ` · 置信度 ${(item.confidence * 100).toFixed(0)}%`}
                      </Text>
                    </Card>
                  ))}
                </Space>
              </Card>
            )}

            {/* Feedback */}
            {result && (
              <Card title="复核反馈">
                <Form layout="vertical">
                  <FormItem label="字段" required>
                    <Select
                      placeholder="选择要复核的字段"
                      value={feedbackField || undefined}
                      onChange={(v) => setFeedbackField(v)}
                      style={{ width: '100%' }}
                    >
                      {Object.keys(fields).map((key) => (
                        <Option key={key} value={key}>
                          {key}
                        </Option>
                      ))}
                    </Select>
                  </FormItem>
                  <FormItem label="修正值">
                    <Input
                      placeholder="输入正确值"
                      value={feedbackCorrection}
                      onChange={setFeedbackCorrection}
                    />
                  </FormItem>
                  <FormItem label="备注">
                    <Input.TextArea
                      placeholder="补充说明（可选）"
                      value={feedbackComment}
                      onChange={setFeedbackComment}
                      maxLength={500}
                      showWordLimit
                    />
                  </FormItem>
                  <Button
                    type="primary"
                    loading={feedbackLoading}
                    onClick={handleFeedback}
                    long
                  >
                    提交反馈
                  </Button>
                </Form>
              </Card>
            )}
          </Space>
        </Col>
      </Row>
    </Space>
  );
}
