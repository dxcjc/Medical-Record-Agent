import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Select, Button, Upload, Tag, Radio } from '@arco-design/web-react';
import { toast } from '../components/GlobalToast';
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
  const [exampleFile, setExampleFile] = useState<File | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [schemaKey, setSchemaKey] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [filePreviews, setFilePreviews] = useState<Map<string, string>>(new Map());
  const [createMode, setCreateMode] = useState<'merge' | 'separate'>('merge');

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
    setExampleFile(null);
  };

  /** Fetch example file eagerly and add to file list */
  const handleUseExample = async () => {
    if (useExample) {
      toast.info('示例文件已选中');
      return;
    }

    // Auto-select the expected schema
    const targetSchema = schemas.find(
      (s) => s.schemaKey === 'tumor-gene-test' || s.schemaKey === 'tumor-gene'
    );
    if (targetSchema && !schemaKey) {
      setSchemaKey(targetSchema.schemaKey);
    }

    // If already fetched, reuse
    if (exampleFile) {
      setUseExample(true);
      toast.success('已选中示例文件');
      return;
    }

    // Fetch immediately
    setExampleLoading(true);
    try {
      const resp = await fetch('/example-tumor-gene-test.png');
      if (!resp.ok) throw new Error('示例文件加载失败');
      const blob = await resp.blob();
      const file = new File([blob], '肿瘤基因检测申请单示例.png', { type: 'image/png' });
      setExampleFile(file);
      setUseExample(true);
      toast.success('已加载示例文件');
    } catch {
      toast.error('示例文件加载失败，请直接上传文件');
    } finally {
      setExampleLoading(false);
    }
  };

  /** Upload a single file and create a job, returns true on success */
  const uploadAndCreateJob = async (file: File): Promise<boolean> => {
    const storedFile = await filesApi.upload(file);
    await createJob.mutateAsync({
      schemaKey,
      sourceFileId: storedFile.id,
    });
    return true;
  };

  /** Upload multiple files and create one merged job */
  const uploadAndCreateMergedJob = async (filesToUpload: File[]): Promise<boolean> => {
    const storedFiles = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      setProgressText(`正在上传文件 (${i + 1}/${filesToUpload.length})...`);
      storedFiles.push(await filesApi.upload(filesToUpload[i]));
    }

    setProgressText('正在创建合并识别任务...');
    await createJob.mutateAsync({
      schemaKey,
      sourceFileIds: storedFiles.map((file) => file.id),
    });

    return true;
  };

  const handleSubmit = async () => {
    const filesToUpload = useExample && exampleFile ? [exampleFile] : files;

    if (filesToUpload.length === 0) {
      toast.warning('请至少上传一个文件');
      return;
    }
    if (!schemaKey) {
      toast.warning('请选择识别 Schema');
      return;
    }

    // Pre-check file sizes
    for (const f of filesToUpload) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`文件 ${f.name} 超过 20MB 限制`);
        return;
      }
    }

    setSubmitting(true);
    let createdCount = 0;
    const totalFiles = filesToUpload.length;

    try {
      if (createMode === 'merge') {
        // 合并模式：所有文件上传后创建一个合并任务
        await uploadAndCreateMergedJob(filesToUpload);
        createdCount = 1;
        setProgressText('✅ 合并任务创建成功，正在跳转...');
        toast.success(`成功创建 1 个合并识别任务（${totalFiles} 个文件）`);
        setFiles([]);
        setUseExample(false);
        setTimeout(() => navigate('/jobs'), 2000);
        return;
      }

      // 分别创建模式：每个文件创建一个任务
      for (let i = 0; i < totalFiles; i++) {
        setProgressText(`正在上传文件 (${i + 1}/${totalFiles})...`);
        try {
          setProgressText(`正在创建识别任务 (${i + 1}/${totalFiles})...`);
          await uploadAndCreateJob(filesToUpload[i]);
          createdCount++;
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : '未知错误';
          toast.error(`文件 ${filesToUpload[i].name} 处理失败: ${errMsg}`);
        }
      }

      if (createdCount > 0) {
        setProgressText('✅ 任务创建成功，正在跳转...');
        toast.success(`成功创建 ${createdCount} 个识别任务`);
        setFiles([]);
        setUseExample(false);
        setTimeout(() => navigate('/jobs'), 2000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      toast.error(msg);
    } finally {
      // Only reset submitting if no successful jobs (since we navigate away on success)
      if (createdCount === 0) {
        setSubmitting(false);
        setProgressText('');
      }
    }
  };

  const isImageFile = (f: File) => f.type.startsWith('image/');
  const previewSrc = (f: File) => filePreviews.get(`${f.name}-${f.size}`) || '';

  // All files to display (user files + example)
  const displayFiles = useExample && exampleFile ? [...files, exampleFile] : files;
  const hasFiles = files.length > 0 || (useExample && exampleFile !== null);

  const submitDisabled = submitting || !hasFiles || !schemaKey;

  return (
    <div>
      <PageHeader
        eyebrow="识别管理"
        title="新建识别任务"
        subtitle="上传医疗文档，选择 Schema 后开始识别"
      />

      <div style={{ maxWidth: 860 }}>
        {/* 进度提示卡片 */}
        {submitting && (
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
                disabled={submitting}
                style={{ width: '100%' }}
                onChange={(fileList: UploadItem[]) => {
                  const incoming = fileList
                    .filter((item) => item.originFile)
                    .map((item) => item.originFile as File);

                  if (incoming.length > 0) {
                    // Size check
                    const oversized = incoming.find((f) => f.size > MAX_FILE_SIZE);
                    if (oversized) {
                      toast.error(`文件 ${oversized.name} 超过 20MB 限制`);
                      return;
                    }

                    setFiles((prev) => {
                      // Deduplicate by name + size
                      const existingKeys = new Set(prev.map((f) => `${f.name}::${f.size}`));
                      const unique = incoming.filter(
                        (f) => !existingKeys.has(`${f.name}::${f.size}`)
                      );
                      if (unique.length > 0) {
                        toast.success(`已选择 ${unique.length} 个文件`);
                        return [...prev, ...unique];
                      }
                      return prev;
                    });
                  }
                }}
              >
                <div
                  className="upload-drag-area"
                  style={{
                    padding: '40px 20px',
                    minHeight: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed var(--color-border)',
                    borderRadius: 8,
                    transition: 'border-color 0.2s, background 0.2s',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (submitting) return;
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.background = 'var(--color-primary-light-1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <IconUpload size={36} style={{ color: 'var(--color-primary)', marginBottom: 12 }} />
                  <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>点击或拖拽文件到此处上传</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    支持图片、PDF 等格式，可多选，单文件最大 20MB
                  </p>
                </div>
              </Upload>

              {/* File list */}
              {displayFiles.length > 0 && (
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
                      {!submitting && (
                        <Button
                          type="text"
                          size="mini"
                          icon={<IconXCircle />}
                          onClick={() => handleRemoveFile(index)}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Example file in list */}
                  {useExample && exampleFile && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 12px',
                        gap: 8,
                        borderTop: files.length > 0 ? '1px solid var(--color-border)' : undefined,
                      }}
                    >
                      <IconImage size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {EXAMPLE_FILE_NAME}
                      </span>
                      <Tag color="blue" size="small" style={{ flexShrink: 0 }}>示例文件</Tag>
                      {!submitting && (
                        <Button
                          type="text"
                          size="mini"
                          icon={<IconXCircle />}
                          onClick={handleRemoveExample}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </FormItem>

            {/* Example button */}
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
                  disabled={useExample || exampleLoading || submitting}
                  loading={exampleLoading}
                >
                  {useExample ? '已选中' : '使用示例'}
                </Button>
              </div>
            </FormItem>

            <FormItem label="创建模式">
              <Radio.Group
                type="button"
                value={createMode}
                onChange={(v) => setCreateMode(v as 'merge' | 'separate')}
                disabled={submitting}
              >
                <Radio value="merge">合并为一个任务</Radio>
                <Radio value="separate">每个文件分别创建任务</Radio>
              </Radio.Group>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 4 }}>
                {createMode === 'merge'
                  ? '合并模式会按上传顺序 OCR 多张图片，并生成一个病例级识别结果'
                  : '分别模式会为每个文件创建独立的识别任务'}
              </div>
            </FormItem>

            <FormItem label="选择 Schema" required>
              <Select
                placeholder="选择识别 Schema"
                value={schemaKey || undefined}
                onChange={(v) => setSchemaKey(v as string)}
                style={{ width: '100%' }}
                loading={schemasLoading}
                disabled={submitting}
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
                loading={submitting}
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
