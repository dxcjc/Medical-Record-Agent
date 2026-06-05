import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, GitCompare, Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { DraftEditorPanel } from "./components/DraftEditorPanel";
import { SchemaFlowPanel } from "./components/SchemaFlowPanel";
import { SchemaListPanel } from "./components/SchemaListPanel";
import { ValidationResultsPanel } from "./components/ValidationResultsPanel";
import { VersionListPanel } from "./components/VersionListPanel";
import {
  initialDraftFields,
  schemaRecords,
  schemaVersionsById,
  validationResults,
  type FlowState,
  type SchemaFieldDraft
} from "./components/schemaStudioData";

type ApiLoadState =
  | { status: "loading"; count: number; statusSummary: string; error: null }
  | { status: "success"; count: number; statusSummary: string; error: null }
  | { status: "error"; count: number; statusSummary: string; error: string };

type ActionKey = "validate" | "publish" | "compare";

type ActionState = Record<
  ActionKey,
  {
    isRunning: boolean;
    message: string;
    error: string;
  }
>;

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function readStringField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function summarizeSchemaStatuses(items: unknown[]) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    // 后端 schema 列表字段可能仍在演进，页面只读取常见状态字段，读不到时归入“未知”。
    const status = readStringField(item, ["status", "state", "lifecycleStatus", "versionStatus"]) ?? "未知";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  if (counts.size === 0) {
    return "暂无状态";
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${status} ${count}`)
    .join("、");
}

function buildDraftDefinition(fields: SchemaFieldDraft[]) {
  return {
    fields: fields.map((field) => ({
      name: field.name,
      metadata: field.metadata,
      aliases: field.aliases,
      enumMap: field.enumMap,
      validators: field.validators,
      normalizers: field.normalizers,
      adapterHints: field.adapterHints
    }))
  };
}

export default function SchemaStudioPage() {
  const { api } = useAuth();
  const firstSchema = schemaRecords[0];
  if (!firstSchema) {
    throw new Error("Schema Studio 缺少演示 Schema 数据");
  }

  const [selectedSchemaId, setSelectedSchemaId] = useState(firstSchema.id);
  const versions = schemaVersionsById[selectedSchemaId] ?? [];
  const firstVersion = versions[0];
  const selectedSchema = schemaRecords.find((schema) => schema.id === selectedSchemaId) ?? firstSchema;

  const [selectedVersionId, setSelectedVersionId] = useState(firstVersion?.id ?? "");
  const [isAdmin, setIsAdmin] = useState(false);
  const [draftFields, setDraftFields] = useState<SchemaFieldDraft[]>(initialDraftFields);
  const [apiSchemaState, setApiSchemaState] = useState<ApiLoadState>({
    status: "loading",
    count: schemaRecords.length,
    statusSummary: "读取中",
    error: null
  });
  const [actionState, setActionState] = useState<ActionState>({
    validate: { isRunning: false, message: "", error: "" },
    publish: { isRunning: false, message: "", error: "" },
    compare: { isRunning: false, message: "", error: "" }
  });
  const [flowState, setFlowState] = useState<FlowState>({
    publishRequested: false,
    deactivateRequested: false,
    rollbackTarget: selectedSchema.activeVersion,
    compareBase: selectedSchema.activeVersion
  });

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? firstVersion;
  const selectedDraftVersion = versions.find((version) => version.status === "draft") ?? selectedVersion;

  useEffect(() => {
    let shouldIgnore = false;

    async function loadSchemas() {
      setApiSchemaState((currentState) => ({
        status: "loading",
        count: currentState.count,
        statusSummary: currentState.statusSummary,
        error: null
      }));

      try {
        const response = await api.listSchemas();

        if (shouldIgnore) {
          return;
        }

        setApiSchemaState({
          status: "success",
          count: response.items.length,
          statusSummary: summarizeSchemaStatuses(response.items),
          error: null
        });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setApiSchemaState({
          status: "error",
          count: schemaRecords.length,
          statusSummary: "静态兜底",
          error: formatApiError(error, "Schema API 暂不可用，继续展示静态演示列表。")
        });
      }
    }

    void loadSchemas();

    return () => {
      shouldIgnore = true;
    };
  }, [api]);

  const compareRows = useMemo(() => {
    const draftVersion = versions.find((version) => version.status === "draft") ?? selectedVersion;
    const compareBase = versions.find((version) => version.version === flowState.compareBase) ?? selectedVersion;

    if (!draftVersion || !compareBase) {
      return [];
    }

    return [
      {
        metric: "字段覆盖率",
        draft: `${draftVersion.coverage.toFixed(1)}%`,
        base: `${compareBase.coverage.toFixed(1)}%`,
        impact: draftVersion.coverage >= compareBase.coverage ? "提升" : "下降"
      },
      {
        metric: "错误率",
        draft: `${draftVersion.errorRate.toFixed(1)}%`,
        base: `${compareBase.errorRate.toFixed(1)}%`,
        impact: draftVersion.errorRate <= compareBase.errorRate ? "降低" : "升高"
      },
      {
        metric: "变更摘要",
        draft: draftVersion.changeSummary,
        base: compareBase.changeSummary,
        impact: "需人工确认"
      }
    ];
  }, [flowState.compareBase, selectedVersion, versions]);

  const handleSelectSchema = (schemaId: string) => {
    const nextSchema = schemaRecords.find((schema) => schema.id === schemaId);
    const nextVersions = schemaVersionsById[schemaId] ?? [];
    const nextVersion = nextVersions[0];

    setSelectedSchemaId(schemaId);
    setSelectedVersionId(nextVersion?.id ?? "");

    if (nextSchema) {
      // 切换 Schema 时同步操作流默认目标，避免继续显示上一条 Schema 的生产版本。
      setFlowState({
        publishRequested: false,
        deactivateRequested: false,
        rollbackTarget: nextSchema.activeVersion,
        compareBase: nextSchema.activeVersion
      });
    }
  };

  const handleUpdateField = (
    fieldId: string,
    key: keyof Omit<SchemaFieldDraft, "id">,
    value: string
  ) => {
    setDraftFields((currentFields) =>
      currentFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              [key]: value
            }
          : field
      )
    );
  };

  const handleAddField = () => {
    setDraftFields((currentFields) => [
      ...currentFields,
      {
        id: `custom-${currentFields.length + 1}`,
        name: "newField",
        metadata: "字段说明；类型；是否必填；业务用途。",
        aliases: "请输入别名，使用逗号分隔。",
        enumMap: "源值=>标准值",
        validators: "required; 自定义校验规则。",
        normalizers: "trim; 自定义归一化规则。",
        adapterHints: "说明 OCR、LLM 或规则 adapter 如何抽取该字段。"
      }
    ]);
  };

  const handleRemoveField = (fieldId: string) => {
    setDraftFields((currentFields) =>
      currentFields.length > 1 ? currentFields.filter((field) => field.id !== fieldId) : currentFields
    );
  };

  const runSchemaAction = async (
    action: ActionKey,
    operation: () => Promise<unknown>,
    successMessage: string,
    fallbackError: string,
    onSuccess?: () => void
  ) => {
    setActionState((currentState) => ({
      ...currentState,
      [action]: {
        isRunning: true,
        message: "",
        error: ""
      }
    }));

    try {
      await operation();
      onSuccess?.();

      setActionState((currentState) => ({
        ...currentState,
        [action]: {
          isRunning: false,
          message: successMessage,
          error: ""
        }
      }));
    } catch (error) {
      setActionState((currentState) => ({
        ...currentState,
        [action]: {
          isRunning: false,
          message: "",
          error: formatApiError(error, fallbackError)
        }
      }));
    }
  };

  const handleValidateDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "validate",
      () => api.validateSchemaDraft(draftId, { definition: buildDraftDefinition(draftFields) }),
      `已提交 ${selectedSchema.draftVersion} 的真实验证请求。`,
      "草稿验证失败，请稍后重试。"
    );
  };

  const handlePublishDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "publish",
      () => api.publishSchemaDraft(draftId, `${selectedSchema.name} 从 Schema Studio 发布`),
      `已提交 ${selectedSchema.draftVersion} 的发布请求。`,
      "草稿发布失败，请确认权限和草稿状态。",
      () =>
        setFlowState((currentState) => ({
          ...currentState,
          publishRequested: true
        }))
    );
  };

  const handleCompareVersions = () => {
    const draftVersion = selectedDraftVersion?.version ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "compare",
      () =>
        api.compareSchemaVersions(selectedSchema.id, {
          left: draftVersion,
          right: flowState.compareBase
        }),
      `已完成 ${draftVersion} 与 ${flowState.compareBase} 的真实比较请求。`,
      "版本比较失败，请确认版本号仍存在。"
    );
  };

  return (
    <main className="app-page">
      <header className="toolbar">
        <div>
          <h1>Schema Studio</h1>
          <p>面向医疗结构化抽取的 Schema 版本、草稿、验证与生产变更控制台。</p>
        </div>
        <span className="status-pill">
          <Database aria-hidden size={16} />
          {selectedSchema.domain}
        </span>
      </header>

      <section className="warning-box" role="alert">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>生产影响提示</strong>
          <p>
            当前草稿会影响 {selectedSchema.affectedPipelines.join("、")}。
            发布、停用或回滚前请确认验证结果和业务窗口。
          </p>
        </div>
      </section>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="status-pill">Active</span>
          <h2>{selectedSchema.activeVersion}</h2>
          <p>当前生产版本</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">Draft</span>
          <h2>{selectedSchema.draftVersion}</h2>
          <p>待发布草稿</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">
            {apiSchemaState.status === "loading" ? (
              <Loader2 aria-hidden size={14} />
            ) : null}
            API Schema
          </span>
          <h2>{apiSchemaState.status === "loading" ? "读取中" : apiSchemaState.count}</h2>
          <p>{apiSchemaState.statusSummary}</p>
        </article>
      </div>

      {apiSchemaState.error ? (
        <div className="form-error" role="alert">
          Schema 列表加载失败：{apiSchemaState.error}。下方静态 Schema 列表仍可继续使用。
        </div>
      ) : null}

      <div className="form-grid">
        <SchemaListPanel
          schemas={schemaRecords}
          selectedSchemaId={selectedSchemaId}
          onSelectSchema={handleSelectSchema}
        />
        <VersionListPanel
          versions={versions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
        />
      </div>

      <DraftEditorPanel
        fields={draftFields}
        onUpdateField={handleUpdateField}
        onAddField={handleAddField}
        onRemoveField={handleRemoveField}
      />

      <ValidationResultsPanel
        results={validationResults}
        actionState={actionState.validate}
        onValidate={handleValidateDraft}
      />

      <SchemaFlowPanel
        schema={selectedSchema}
        versions={versions}
        isAdmin={isAdmin}
        flowState={flowState}
        onToggleAdmin={() => setIsAdmin((currentValue) => !currentValue)}
        actionState={{
          publish: actionState.publish,
          compare: actionState.compare
        }}
        onPublish={handlePublishDraft}
        onDeactivate={() =>
          setFlowState((currentState) => ({
            ...currentState,
            deactivateRequested: true
          }))
        }
        onRollbackTargetChange={(rollbackTarget) =>
          setFlowState((currentState) => ({
            ...currentState,
            rollbackTarget
          }))
        }
        onCompareBaseChange={(compareBase) =>
          setFlowState((currentState) => ({
            ...currentState,
            compareBase
          }))
        }
        onCompare={handleCompareVersions}
      />

      <section className="panel" aria-labelledby="schema-compare-title">
        <div className="toolbar">
          <div>
            <h2 id="schema-compare-title">版本比较</h2>
            <p>展示草稿与基线版本的关键生产指标差异。</p>
          </div>
          <GitCompare aria-hidden size={20} />
        </div>

        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">草稿</th>
              <th scope="col">基线</th>
              <th scope="col">影响</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.draft}</td>
                <td>{row.base}</td>
                <td>{row.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
