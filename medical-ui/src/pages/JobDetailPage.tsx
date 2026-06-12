import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Spin,
  Collapse,
  Form,
  Input,
  Select,
  Steps,
  Message,
  Divider,
  Grid,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconRefresh,
  IconFile,
  IconStorage,
} from '@arco-design/web-react/icon';
import { useJob } from '../hooks/useJobs';
import { useResult } from '../hooks/useResults';
import { feedbackApi } from '../api/client';
import StatusTag from '../components/StatusTag';
import FieldCard from '../components/FieldCard';
import type { TraceStep, EvidenceItem } from '../api/types';

const { Row, Col } = Grid;
const FormItem = Form.Item;
const Option = Select.Option;
const CollapseItem = Collapse.Item;
const Step = Steps.Step;

function traceStepStatus(step: TraceStep): 'wait' | 'process' | 'finish' | 'error' {
  if (step.status === 'completed') return 'finish';
  if (step.status === 'failed' || step.error) return 'error';
  if (step.status === 'running') return 'process';
  return 'wait';
}

function formatTime(t?: string): string {
  if (!t) return '-';
  return t ? new Date(t).toLocaleString('zh-CN') : '-';
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const JobDetailPage: React.FC = () => {
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
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size={40} />
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p>任务不存在</p>
        <Button onClick={() => navigate('/jobs')}>返回列表</Button>
      </div>
    );
  }

  const fields = result?.fields || {};
  const evidence = result?.evidence || [];
  const trace = job.trace || [];
  const isRunning = ['queued', 'running'].includes(job.status);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Button
          type="text"
          icon={<IconLeft />}
          onClick={() => navigate('/jobs')}
        >
          返回
        </Button>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {job.id}
        </span>
        <StatusTag status={job.status} />
      </div>

      <Row gutter={24}>
        {/* Left Column */}
        <Col span={14}>
          {/* Trace Progress */}
          <Card
            title="识别进度"
            style={{ marginBottom: 16 }}
            bordered={false}
          >
            {trace.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
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
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
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

          {/* Result Loading / No Result */}
          {isRunning && !result && (
            <Card bordered={false} style={{ marginBottom: 16 }}>
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size={40} />
                <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>
                  识别中...
                </p>
              </div>
            </Card>
          )}

          {/* OCR Text */}
          {result && (
            <Card
              title="OCR 文本"
              style={{ marginBottom: 16 }}
              bordered={false}
            >
              <Collapse>
                <CollapseItem header="点击展开原始 OCR 文本" name="ocr">
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      background: 'var(--color-bg)',
                      padding: 12,
                      borderRadius: 6,
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(result.payload, null, 2)}
                  </pre>
                </CollapseItem>
              </Collapse>
            </Card>
          )}

          {/* Field Results */}
          {result && Object.keys(fields).length > 0 && (
            <Card title="字段结果" bordered={false}>
              {Object.entries(fields).map(([key, value]) => (
                <FieldCard
                  key={key}
                  fieldKey={key}
                  value={value}
                  label={key}
                />
              ))}
            </Card>
          )}
        </Col>

        {/* Right Column */}
        <Col span={10}>
          {/* Job Info Card */}
          <Card
            title="任务信息"
            style={{ marginBottom: 16 }}
            bordered={false}
          >
            <div style={{ fontSize: 13 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>Schema</span>
                <span>{job.schemaKey}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>Provider</span>
                <span>
                  {(job.providerConfig?.providerKey as string) ||
                    (job.providerConfig?.ocrProviderKey as string) ||
                    '-'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>创建时间</span>
                <span>{formatTime(job.createdAt)}</span>
              </div>
            </div>
          </Card>

          {/* Evidence */}
          {evidence.length > 0 && (
            <Card
              title="证据"
              style={{ marginBottom: 16 }}
              bordered={false}
            >
              {evidence.map((item: EvidenceItem, idx: number) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-bg)',
                    borderRadius: 6,
                    marginBottom: 8,
                    fontSize: 12,
                  }}
                >
                  {item.fieldKey && (
                    <Tag size="small" style={{ marginBottom: 4 }}>
                      {item.fieldKey}
                    </Tag>
                  )}
                  <div style={{ color: 'var(--color-text)' }}>
                    {item.snippet || '-'}
                  </div>
                  <div
                    style={{
                      color: 'var(--color-text-secondary)',
                      marginTop: 4,
                    }}
                  >
                    {item.page && `第 ${item.page} 页`}
                    {item.confidence != null &&
                      ` · 置信度 ${(item.confidence * 100).toFixed(0)}%`}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Feedback Section */}
          {result && (
            <Card title="复核" bordered={false}>
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
        </Col>
      </Row>
    </div>
  );
};

export default JobDetailPage;
