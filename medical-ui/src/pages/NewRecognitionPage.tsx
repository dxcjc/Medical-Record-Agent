import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, Button, Message, Spin } from '@arco-design/web-react';
import { IconFile, IconUpload } from '@arco-design/web-react/icon';
import { useSchemas } from '../hooks/useSchemas';
import { useCreateJob } from '../hooks/useJobs';
import { filesApi } from '../api/client';

const Option = Select.Option;

const NewRecognitionPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: schemasData, isLoading: schemasLoading } = useSchemas();
  const createJob = useCreateJob();

  const [file, setFile] = useState<File | null>(null);
  const [schemaKey, setSchemaKey] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const schemas = schemasData?.items || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
    }
  };

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
      // Upload file
      const storedFile = await filesApi.upload(file);

      // Create job
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
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div
        style={{
          background: 'var(--color-bg-white)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          padding: '32px 36px',
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 24,
            fontFamily: 'var(--font-heading)',
          }}
        >
          新建识别任务
        </h2>

        {/* Step 1: Upload */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: 'var(--color-text)',
            }}
          >
            1. 上传文件
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 8,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--color-primary-light)' : 'var(--color-bg)',
              transition: 'all 0.2s',
            }}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {file ? (
              <div>
                <IconFile
                  style={{
                    fontSize: 32,
                    color: 'var(--color-primary)',
                    marginBottom: 8,
                  }}
                />
                <p style={{ fontSize: 14, fontWeight: 500 }}>{file.name}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <IconUpload
                  style={{
                    fontSize: 32,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 8,
                  }}
                />
                <p style={{ fontSize: 14, color: 'var(--color-text)' }}>
                  点击或拖拽文件到此处上传
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  支持图片、PDF 等格式
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Schema Select */}
        <div style={{ marginBottom: 32 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 8,
              color: 'var(--color-text)',
            }}
          >
            2. 选择 Schema
          </label>
          <Select
            placeholder="选择识别 Schema"
            value={schemaKey || undefined}
            onChange={(v) => setSchemaKey(v)}
            style={{ width: '100%' }}
            size="large"
            loading={schemasLoading}
          >
            {schemas.map((s) => (
              <Option key={s.schemaKey} value={s.schemaKey}>
                {s.displayName} (v{s.version})
              </Option>
            ))}
          </Select>
        </div>

        {/* Step 3: Submit */}
        <Button
          type="primary"
          size="large"
          long
          loading={uploading || createJob.isPending}
          onClick={handleSubmit}
          disabled={!file || !schemaKey}
        >
          开始识别
        </Button>
      </div>
    </div>
  );
};

export default NewRecognitionPage;
