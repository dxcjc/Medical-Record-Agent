import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Select, Button, Upload, Message, Tag, Notification } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { useSchemas } from '../hooks/useSchemas';
import { useCreateJob } from '../hooks/useJobs';
import { filesApi } from '../api/client';
import PageHeader from '../components/PageHeader';
import { IconFileText, IconUpload, IconXCircle, IconImage } from '../icons/appIcons';

const { Option } = Select;
const FormItem = Form.Item;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const EXAMPLE_FILE_NAME = '肿瘤基因检测申请单示例';

export default function NewRecognitionPage() {
  const navigate = useNavigate();
  const { data: schemasData, isLoading: schemasLoading } = useSchemas();
  const createJob = useCreateJob();

  const [files, setFiles] = useState<File[]>([]);
  const [useExample, setUseExample] = useState(false);
  const [schemaKey, setSchemaKey] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [filePreviews, setFilePreviews] = useState<Map<string, string>>(new Map());

  const schemas = schemasData?.items || [];

  // Auto-select schema if only one exists
  useEffect(() => {
    if (schemas.length === 1 && !schemaKey) {
      setSchemaKey(schemas[0].schemaKey);
    }
  }, [schemas, schemaKey]);

  // Build image preview URLs, clean up on unmount
  useEffect(() => {
    const urls = new Map<string, string>();
    files.forEach((f) => {
      if (f.type.startsWith('image/')) {
        urls.set(`${f.name}-${f.size}`, URL.createObjectURL(f));
      }
    });
    setFilePreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExample = () => {
    setUseExample(false);
  };

  const handleSubmit = async () => {
    if (files.length === 0 && !useExample) {
      Message.warning('请至少上传一个文件');
      return;
    }
    if (!schemaKey) {
      Message.warning('请选择识别 Schema');
      return;
    }

    // Pre-check file sizes
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        Message.error(`文件 ${f.name} 超过 20MB 限制`);
        return;
      }
    }
    // If user clicked "使用示例", guide them to upload a real file
    if (useExample && files.length === 0) {
      Message.info('请上传肿瘤基因检测申请单图片');
      return;
    }

    setUploading(true);
    setProgressText('正在创建任务...');

    const notifKey = `creating-${Date.now()}`;
    Notification.info({
      id: notifKey,
      title: '创建识别任务',
      content: '正在创建任务，请稍候...',
      duration: 0,
      closable: false,
    });

    let createdCount = 0;
    const errors: string[] = [];

    try {
      // Upload and create tasks for user files
      for (let i = 0; i < files.length; i++) {
        setProgressText(`正在处理 ${i + 1}/${files.length}...`);
        try {
          const storedFile = await filesApi.upload(files[i]);
          await createJob.mutateAsync({
            schemaKey,
            sourceFileId: storedFile.id,
          });
          createdCount++;
        } catch (e) {
          errors.push(`文件 ${files[i].name} 处理失败`);
        }
      }

      Notification.remove(notifKey);

      setFiles([]);
      setUseExample(false);

      if (createdCount > 0) {
        Notification.success({
          title: '创建成功',
          content: `成功创建 ${createdCount} 个识别任务，正在跳转...`,
          duration: 5000,
        });
        setTimeout(() => navigate('/jobs'), 1500);
      } else {
        Notification.error({
          title: '创建失败',
          content: errors.join('；') || '未知错误',
          duration: 5000,
        });
      }
    } catch (err: unknown) {
      Notification.remove(notifKey);
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      Notification.error({
        title: '创建失败',
        content: msg,
        duration: 5000,
      });
    } finally {
      setUploading(false);
      setProgressText('');
    }
  };

  const handleUseExample = () => {
    if (useExample) {
      Message.info('示例文件已选中');
      return;
    }

    // Auto-select the expected schema
    const targetSchema = schemas.find(
      (s) => s.schemaKey === 'tumor-gene-test' || s.schemaKey === 'tumor-gene'
    );
    if (targetSchema && !schemaKey) {
      setSchemaKey(targetSchema.schemaKey);
    }

    setUseExample(true);
    Message.success('已选中示例文件，请点击"开始识别"');
  };

  const isImageFile = (f: File) => f.type.startsWith('image/');
  const previewSrc = (f: File) => filePreviews.get(`${f.name}-${f.size}`) || '';

  const submitDisabled =
    uploading || (files.length === 0 && !useExample) || !schemaKey;

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
                  const incoming = fileList
                    .filter((item) => item.originFile)
                    .map((item) => item.originFile as File);

                  if (incoming.length > 0) {
                    // Size check
                    const oversized = incoming.find((f) => f.size > MAX_FILE_SIZE);
                    if (oversized) {
                      Message.error(`文件 ${oversized.name} 超过 20MB 限制`);
                      return;
                    }

                    setFiles((prev) => {
                      // Deduplicate by name + size
                      const existingKeys = new Set(prev.map((f) => `${f.name}::${f.size}`));
                      const unique = incoming.filter(
                        (f) => !existingKeys.has(`${f.name}::${f.size}`)
                      );
                      return unique.length > 0 ? [...prev, ...unique] : prev;
                    });
                  }
                }}
              >
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <IconUpload size={32} style={{ color: 'var(--color-muted)', marginBottom: 8 }} />
                  <p style={{ fontSize: 14 }}>点击或拖拽文件到此处上传</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    支持图片、PDF 等格式，可多选，单文件最大 20MB
                  </p>
                </div>
              </Upload>

              {/* File list */}
              {files.length > 0 && (
                <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 0' }}>
                  {files.map((f, index) => (
                    <div
                      key={`${f.name}-${f.size}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 12px',
                        gap: 8,
                      }}
                    >
                      {/* Thumbnail or icon */}
                      {isImageFile(f) && previewSrc(f) ? (
                        <img
                          src={previewSrc(f)}
                          alt={f.name}
                          style={{
                            width: 32,
                            height: 32,
                            objectFit: 'cover',
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <IconFileText size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
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

              {/* Example file in list when selected */}
              {useExample && (
                <div style={{ marginTop: files.length > 0 ? 0 : 12, border: '1px solid var(--color-border)', borderRadius: 6, borderTop: files.length > 0 ? 'none' : undefined, padding: '8px 0' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 12px',
                      gap: 8,
                    }}
                  >
                    <IconImage size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {EXAMPLE_FILE_NAME}
                    </span>
                    <Tag color="blue" size="small" style={{ flexShrink: 0 }}>示例文件</Tag>
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconXCircle />}
                      onClick={handleRemoveExample}
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                </div>
              )}
            </FormItem>

            {/* Example button — separate section with clear visual hierarchy */}
            <FormItem>
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--color-fill-1)',
                  borderRadius: 6,
                  border: '1px dashed var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>📋 没有文件？使用示例</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                    肿瘤基因检测申请单（tumor-gene-test-real.png）
                  </div>
                </div>
                <Button
                  type="outline"
                  size="small"
                  onClick={handleUseExample}
                  disabled={useExample}
                >
                  {useExample ? '已选中' : '使用示例'}
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
                disabled={submitDisabled}
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
