import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Form, Select, Button, Upload, Message, Tag } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { useSchemas } from '../hooks/useSchemas';
import { useCreateJob } from '../hooks/useJobs';
import { filesApi } from '../api/client';
import PageHeader from '../components/PageHeader';
import { IconFileText, IconUpload, IconXCircle } from '../icons/appIcons';

const { Option } = Select;
const FormItem = Form.Item;

const EXAMPLE_FILE_ID = 'cmqba9zrt0007wm7edfarre9k';
const EXAMPLE_FILE_NAME = 'tumor-gene-test-vision.png';
const EXAMPLE_FILE_SIZE = 2.4 * 1024 * 1024; // 2.4MB

export default function NewRecognitionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: schemasData, isLoading: schemasLoading } = useSchemas();
  const createJob = useCreateJob();

  const [files, setFiles] = useState<File[]>([]);
  const [schemaKey, setSchemaKey] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [exampleFileId, setExampleFileId] = useState<string | null>(null);

  const schemas = schemasData?.items || [];

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    // 如果移除的是示例文件，清除 exampleFileId
    if (exampleFileId && files[index]?.name === EXAMPLE_FILE_NAME) {
      setExampleFileId(null);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0 && !exampleFileId) {
      Message.warning('请至少上传一个文件');
      return;
    }
    if (!schemaKey) {
      Message.warning('请选择识别 Schema');
      return;
    }

    setUploading(true);
    let createdCount = 0;
    try {
      // 如果有示例文件，直接使用已有的 fileId 创建任务
      if (exampleFileId) {
        setProgressText('正在创建示例任务...');
        await createJob.mutateAsync({
          schemaKey,
          sourceFileId: exampleFileId,
        });
        createdCount++;
      }

      // 上传并创建普通文件的任务
      for (let i = 0; i < files.length; i++) {
        setProgressText(`正在处理 ${i + 1}/${files.length}...`);
        const storedFile = await filesApi.upload(files[i]);
        await createJob.mutateAsync({
          schemaKey,
          sourceFileId: storedFile.id,
        });
        createdCount++;
      }

      Message.success(`成功创建 ${createdCount} 个识别任务`);
      setFiles([]);
      setExampleFileId(null);
      if (location.pathname !== '/jobs') {
        navigate('/jobs');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      Message.error(msg);
    } finally {
      setUploading(false);
      setProgressText('');
    }
  };

  const handleUseExample = () => {
    // 自动选中 Schema
    setSchemaKey('tumor-gene-test');

    // 创建一个占位 File 对象用于显示
    const placeholder = new File([''], EXAMPLE_FILE_NAME, { type: 'image/png' });
    Object.defineProperty(placeholder, 'size', { value: EXAMPLE_FILE_SIZE });

    // 如果还没有示例文件，添加到文件列表
    if (!exampleFileId) {
      setFiles((prev) => {
        // 避免重复添加
        if (prev.some((f) => f.name === EXAMPLE_FILE_NAME)) return prev;
        return [...prev, placeholder];
      });
      setExampleFileId(EXAMPLE_FILE_ID);
    }

    Message.success('已选中示例文件，请点击"开始识别"');
  };

  return (
    <div>
      <PageHeader
        eyebrow="识别管理"
        title="新建识别任务"
        subtitle="上传医疗文档，选择 Schema 后开始识别"
      />

      <div style={{ maxWidth: 640 }}>
        {uploading && (
          <Card style={{ marginBottom: 12, background: 'var(--color-primary-light-1)', border: '1px solid var(--color-primary-light-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--color-primary)' }}>⏳</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-primary)' }}>{progressText || '准备中...'}</span>
            </div>
          </Card>
        )}
        <Card>
          <Form layout="vertical">
            <FormItem label="上传文件" required>
              <Upload
                drag
                multiple
                accept="image/*,.pdf"
                showUploadList={false}
                fileList={[]}
                onChange={(fileList: UploadItem[]) => {
                  const newFiles = fileList
                    .filter((item) => item.originFile)
                    .map((item) => item.originFile as File);
                  if (newFiles.length > 0) {
                    setFiles((prev) => [...prev, ...newFiles]);
                  }
                }}
              >
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <IconUpload size={32} style={{ color: 'var(--color-muted)', marginBottom: 8 }} />
                  <p style={{ fontSize: 14 }}>点击或拖拽文件到此处上传</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    支持图片、PDF 等格式，可多选
                  </p>
                </div>
              </Upload>

              {files.length > 0 && (
                <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 0' }}>
                  {files.map((f, index) => (
                    <div
                      key={`${f.name}-${f.size}-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 12px',
                        gap: 8,
                      }}
                    >
                      <IconFileText size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      {f.name === EXAMPLE_FILE_NAME && (
                        <Tag color="blue" size="small" style={{ flexShrink: 0 }}>示例文件</Tag>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--color-muted)', flexShrink: 0 }}>
                        {f.size >= 1024 * 1024
                          ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${(f.size / 1024).toFixed(1)} KB`}
                      </span>
                      <Button
                        type="text"
                        size="mini"
                        icon={<IconXCircle />}
                        onClick={() => handleRemoveFile(index)}
                        style={{ flexShrink: 0 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <Button
                  type="outline"
                  long
                  onClick={handleUseExample}
                  style={{ borderStyle: 'dashed' }}
                >
                  📋 使用示例肿瘤基因检测申请单
                </Button>
              </div>
            </FormItem>

            <FormItem label="选择 Schema" required>
              <Select
                placeholder="选择识别 Schema"
                value={schemaKey || undefined}
                onChange={(v) => setSchemaKey(v as string)}
                style={{ width: '100%' }}
                loading={schemasLoading}
              >
                {schemas.map((s) => (
                  <Option key={s.schemaKey} value={s.schemaKey}>
                    {s.displayName || s.schemaKey}
                  </Option>
                ))}
              </Select>
            </FormItem>

            <FormItem>
              <Button
                type="primary"
                loading={uploading}
                onClick={handleSubmit}
                long
              >
                {progressText || '开始识别'}
              </Button>
            </FormItem>
          </Form>
        </Card>
      </div>
    </div>
  );
}
