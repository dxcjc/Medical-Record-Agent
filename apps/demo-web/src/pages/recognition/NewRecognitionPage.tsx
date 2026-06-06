import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons, statusIcons } from "../../icons/appIcons";
import {
  adapterOptions,
  providerOptions,
  schemaOptions,
} from "./components/demoData";
import { EmptyPanel, PageHeader, SectionTitle } from "./components/RecognitionShared";

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; jobId: string }
  | { status: "error"; message: string };

type PrivacyOptions = {
  deidentify: boolean;
  keepEvidence: boolean;
  allowWriteBack: boolean;
};

const initialPrivacyOptions: PrivacyOptions = {
  deidentify: true,
  keepEvidence: true,
  allowWriteBack: false,
};

function readRecordId(value: unknown) {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }

  return undefined;
}

function buildDemoChecksum(file: Pick<File, "name" | "size">) {
  return `demo-${file.name}-${file.size}`;
}

export default function NewRecognitionPage() {
  const { api } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [schemaName, setSchemaName] = useState<(typeof schemaOptions)[number]>(schemaOptions[0]);
  const [adapter, setAdapter] = useState<(typeof adapterOptions)[number]>(adapterOptions[0]);
  const [provider, setProvider] = useState<(typeof providerOptions)[number]>(providerOptions[0]);
  const [privacy, setPrivacy] = useState<PrivacyOptions>(initialPrivacyOptions);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const fileSummary = useMemo(() => {
    if (!selectedFile) {
      return "支持 PNG、JPG、PDF，单文件最大 20MB";
    }

    return `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`;
  }, [selectedFile]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSubmitState({ status: "idle" });
  }

  function updatePrivacy(key: keyof PrivacyOptions) {
    setPrivacy((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function createRecognitionFromFile(file: Pick<File, "name" | "size" | "type">) {
    const createdFile = await api.createFile({
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      checksumSha256: buildDemoChecksum(file),
      metadata: {
        adapter,
        provider,
        privacy,
        source: "demo-web",
      },
    });
    const fileId = readRecordId(createdFile);

    if (!fileId) {
      throw new Error("后端没有返回文件 ID。");
    }

    const createdJob = await api.createRecognitionJob({
      schemaKey: schemaName,
      sourceFileId: fileId,
      document: {
        documentId: fileId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      },
      options: {
        adapter,
        privacy,
      },
      providerConfig: {
        providerKey: provider,
      },
    });
    const jobId = readRecordId(createdJob);

    if (!jobId) {
      throw new Error("后端没有返回任务 ID。");
    }

    return jobId;
  }

  async function submitWithFile(file: File | null) {
    if (!file) {
      setSubmitState({ status: "error", message: "请先上传图片或 PDF 文件。" });
      return;
    }

    setSubmitState({ status: "loading" });

    try {
      const jobId = await createRecognitionFromFile(file);
      setSubmitState({ status: "success", jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建识别任务失败，请稍后重试。";
      setSubmitState({ status: "error", message });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitWithFile(selectedFile);
  }

  function handleSyntheticSubmit() {
    setSubmitState({ status: "loading" });

    void submitWithFile({
      name: "synthetic-clinical-record.pdf",
      size: 187_392,
      type: "application/pdf",
    } as File);
  }

  const isLoading = submitState.status === "loading";

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title="新建识别任务"
        description="上传病历图片或 PDF，选择模板、Adapter、Provider 与隐私策略后创建识别任务。"
      />

      <form className="panel recognition-form-panel" onSubmit={handleSubmit}>
        <SectionTitle title="文件与识别配置" />

        <label className={`upload-zone ${selectedFile ? "is-ready" : ""}`}>
          <AppIcon icon={actionIcons.createRecognition} size="lg" tone={selectedFile ? "green" : "blue"} tile />
          <strong>{selectedFile ? "文件已选择" : "上传图片或 PDF"}</strong>
          <span>{fileSummary}</span>
          <input
            aria-label="上传识别文件"
            accept="image/png,image/jpeg,application/pdf"
            type="file"
            onChange={handleFileChange}
          />
        </label>

        <div className="form-grid">
          <label className="field-row">
            <span>Schema 模板</span>
            <select
              aria-label="选择 Schema 模板"
              value={schemaName}
              onChange={(event) => setSchemaName(event.target.value as typeof schemaName)}
            >
              {schemaOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>Adapter</span>
            <select
              aria-label="选择 Adapter"
              value={adapter}
              onChange={(event) => setAdapter(event.target.value as typeof adapter)}
            >
              {adapterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>Provider</span>
            <select
              aria-label="选择 Provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as typeof provider)}
            >
              {providerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="evidence-panel" aria-labelledby="privacy-title">
          <h2 id="privacy-title">
            <AppIcon icon={actionIcons.privacyPolicy} size="md" />
            隐私选项
          </h2>
          <label className="field-row checkbox-row">
            <input
              aria-label="开启患者信息脱敏"
              checked={privacy.deidentify}
              type="checkbox"
              onChange={() => updatePrivacy("deidentify")}
            />
            <span>开启患者信息脱敏</span>
          </label>
          <label className="field-row checkbox-row">
            <input
              aria-label="保留字段证据链"
              checked={privacy.keepEvidence}
              type="checkbox"
              onChange={() => updatePrivacy("keepEvidence")}
            />
            <span>保留字段证据链</span>
          </label>
          <label className="field-row checkbox-row">
            <input
              aria-label="允许绿色决策自动写回"
              checked={privacy.allowWriteBack}
              type="checkbox"
              onChange={() => updatePrivacy("allowWriteBack")}
            />
            <span>允许绿色决策自动写回</span>
          </label>
        </section>

        <div className="toolbar">
          <button className="action-button" type="submit" aria-label="开始识别" disabled={isLoading}>
            <AppIcon
              icon={isLoading ? commonUiIcons.loading : actionIcons.createRecognition}
              size="sm"
              className={isLoading ? "is-spinning" : undefined}
            />
            {isLoading ? "创建中" : "开始识别"}
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="使用合成样本创建识别任务"
            disabled={isLoading}
            onClick={handleSyntheticSubmit}
          >
            <AppIcon icon={dashboardMetricIcons.confidence} size="sm" />
            合成样本
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="清空当前识别表单"
            onClick={() => {
              setSelectedFile(null);
              setPrivacy(initialPrivacyOptions);
              setSubmitState({ status: "idle" });
            }}
          >
            <AppIcon icon={commonUiIcons.close} size="sm" />
            清空
          </button>
        </div>
      </form>

      {submitState.status === "success" ? (
        <EmptyPanel
          icon={actionIcons.createRecognition}
          title="任务已创建"
          description={`任务 ${submitState.jobId} 已进入识别队列，可在任务详情页查看进度。`}
          action={
            <Link className="secondary-button" to={`/recognition/jobs/${encodeURIComponent(submitState.jobId)}`}>
              查看任务详情
            </Link>
          }
        />
      ) : null}

      {submitState.status === "error" ? (
        <EmptyPanel icon={statusIcons.danger} title="创建失败" description={submitState.message} />
      ) : null}
    </main>
  );
}
