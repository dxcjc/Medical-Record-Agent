import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Select, Button, Upload, Message, Typography } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { useSchemas } from '../hooks/useSchemas';
import { useCreateJob } from '../hooks/useJobs';
import { filesApi } from '../api/client';
import PageHeader from '../components/PageHeader';
import { IconFileText, IconUpload } from '../icons/appIcons';

const { Option } = Select;
const { Text } = Typography;
const FormItem = Form.Item;

export default function NewRecognitionPage() {
  const navigate = useNavigate();
  const { data: schemasData, isLoading: schemasLoading } = useSchemas();
  const createJob = useCreateJob();

  const [file, setFile] = useState<File | null>(null);
  const [schemaKey, setSchemaKey] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const schemas = schemasData?.items || [];

  const handleSubmit = async () => {
    if (!file) {
      Message.warning('请上传文件');
      return;
    }
    if (!schemaKey) {
      Message.warning('请选择 Schema');
      return;
    }

    setUploading(true);
    try {
      const storedFile = await filesApi.upload(file);
      const job = await createJob.mutateAsync({
        schemaKey,
        sourceFileId: storedFile.id,
      });
      Message.success('识别任务已创建');
      navigate(`/jobs/${job.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      Message.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="识别管理"
        title="新建识别任务"
        subtitle="上传医疗文档，选择 Schema 后开始识别"
      />

      <div style={{ maxWidth: 640 }}>
        <Card>
          <Form layout="vertical">
            <FormItem label="上传文件" required>
              <Upload
                drag
                accept="image/*,.pdf"
                limit={1}
                showUploadList={false}
                onChange={(fileList: UploadItem[]) => {
                  if (fileList.length > 0 && fileList[0].originFile) {
                    setFile(fileList[0].originFile);
                  }
                }}
              >
                {file ? (
                  <div style={{ padding: 20, textAlign: 'center' }}>
                    <IconFileText size={32} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
                    <p style={{ fontSize: 14, fontWeight: 500 }}>{file.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: 20, textAlign: 'center' }}>
                    <IconUpload size={32} style={{ color: 'var(--color-muted)', marginBottom: 8 }} />
                    <p style={{ fontSize: 14 }}>点击或拖拽文件到此处上传</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      支持图片、PDF 等格式
                    </p>
                  </div>
                )}
              </Upload>
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
                开始识别
              </Button>
            </FormItem>
          </Form>
        </Card>
      </div>
    </div>
  );
}
