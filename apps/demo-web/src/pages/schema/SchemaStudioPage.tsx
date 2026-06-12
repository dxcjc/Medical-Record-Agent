import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import {
  normalizeSchemaCatalog,
  normalizeSchemaValidationIssues,
  summarizeSchemaVersionStatuses
} from "../../api/normalizers";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, commonUiIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { ConfirmDialog } from "../operations/components";
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
  type SchemaRecord,
  type SchemaVersion,
  type SchemaFieldDraft,
  type ValidationResult
} from "./components/schemaStudioData";

type ApiLoadState =
  | { status: "loading"; count: number; statusSummary: string; error: null }
  | { status: "success"; count: number; statusSummary: string; error: null }
  | { status: "error"; count: number; statusSummary: string; error: string };

type ActionKey = "validate" | "publish" | "compare" | "deactivate" | "rollback";

type ActionState = Record<
  ActionKey,
  {
    isRunning: boolean;
    message: string;
    error: string;
  }
>;
type PendingDangerAction = "publish" | "deactivate" | "rollback" | null;

type SchemaActionRecoveryDescriptor = {
  tone: "info" | "success" | "warning";
  title: string;
  message: string;
  canRetry: boolean;
};

type LastSchemaAction = { action: ActionKey };

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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

export function canPublishSchema(hasPermission: (permission: string) => boolean) {
  return hasPermission("schema:publish");
}

export function parseSchemaValidationResults(response: Parameters<typeof normalizeSchemaValidationIssues>[0]): ValidationResult[] {
  return normalizeSchemaValidationIssues(response);
}

export function isConfirmedSchemaDangerAction(action: PendingDangerAction): action is Exclude<PendingDangerAction, null> {
  return action === "publish" || action === "deactivate" || action === "rollback";
}

export function resolveSchemaDangerActionRequest(action: Exclude<PendingDangerAction, null>) {
  return {
    pendingAction: action,
    shouldCallPublishApi: false
  };
}

export function describeSchemaActionRecovery(
  action: ActionKey,
  state: ActionState[ActionKey]
): SchemaActionRecoveryDescriptor {
  const actionLabelMap: Record<ActionKey, string> = {
    validate: "验证",
    publish: "发布",
    compare: "比较",
    deactivate: "停用",
    rollback: "回滚"
  };
  const actionLabel = actionLabelMap[action];

  if (state.isRunning) {
    return {
      tone: "info",
      title: `Schema ${actionLabel}中`,
      message:
        action === "validate"
          ? "正在调用真实 validateDraft API，发布按钮保持受控。"
          : `正在提交 Schema ${actionLabel}请求，请等待后端返回后再发起下一次生产变更。`,
      canRetry: false
    };
  }

  if (state.error) {
    const recoveryMessage =
      action === "publish"
        ? `${state.error}。请刷新 Schema 列表、重新验证草稿后再确认发布。`
        : `${state.error}。请刷新 Schema 列表后重试该操作。`;

    return {
      tone: "warning",
      title: `Schema ${actionLabel}失败`,
      message: recoveryMessage,
      canRetry: true
    };
  }

  if (state.message) {
    return {
      tone: "success",
      title: `Schema ${actionLabel}已提交`,
      message: state.message,
      canRetry: false
    };
  }

  return {
    tone: "info",
    title: `Schema ${actionLabel}待执行`,
    message: "等待用户操作。",
    canRetry: false
  };
}

export default function SchemaStudioPage() {
  const { api, hasPermission } = useAuth();
  const firstSchema = schemaRecords[0] ?? { id: "", name: "", domain: "", owner: "", activeVersion: "", draftVersion: "", affectedPipelines: [] as string[], deactivationRisk: "低" as const };

  const fallbackSchemaId = firstSchema.id;
  const [selectedSchemaId, setSelectedSchemaId] = useState(firstSchema.id);
  const firstVersion = schemaVersionsById[firstSchema.id]?.[0];

  const [selectedVersionId, setSelectedVersionId] = useState(firstVersion?.id ?? "");
  const canPublish = canPublishSchema(hasPermission);
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
    compare: { isRunning: false, message: "", error: "" },
    deactivate: { isRunning: false, message: "", error: "" },
    rollback: { isRunning: false, message: "", error: "" }
  });
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction>(null);
  const [apiSchemaRecords, setApiSchemaRecords] = useState<SchemaRecord[]>([]);
  const [apiSchemaVersionsById, setApiSchemaVersionsById] = useState<Record<string, SchemaVersion[]>>({});
  const [currentValidationResults, setCurrentValidationResults] = useState<ValidationResult[]>(validationResults);
  const [flowState, setFlowState] = useState<FlowState>({
    publishRequested: false,
    deactivateRequested: false,
    rollbackTarget: firstSchema.activeVersion,
    compareBase: firstSchema.activeVersion
  });
  const schemaActionAbortControllerRef = useRef<AbortController | null>(null);
  const lastSchemaActionRef = useRef<LastSchemaAction | null>(null);

  const displaySchemaRecords = apiSchemaRecords.length > 0 ? apiSchemaRecords : schemaRecords;
  const displaySchemaVersionsById = apiSchemaRecords.length > 0 ? apiSchemaVersionsById : schemaVersionsById;
  const displayFirstSchema = displaySchemaRecords[0] ?? firstSchema;
  const displayVersions = displaySchemaVersionsById[selectedSchemaId] ?? [];
  const selectedSchema = displaySchemaRecords.find((schema) => schema.id === selectedSchemaId) ?? displayFirstSchema;
  const selectedVersion = displayVersions.find((version) => version.id === selectedVersionId) ?? displayVersions[0];
  const selectedDraftVersion = displayVersions.find((version) => version.status === "draft") ?? selectedVersion;
  const activeSchemaAction = (Object.keys(actionState) as ActionKey[]).find((action) => actionState[action].isRunning) ?? null;
  const lastSchemaAction = lastSchemaActionRef.current?.action ?? null;
  const schemaRecoveryDescriptor = describeSchemaActionRecovery(
    lastSchemaAction ?? activeSchemaAction ?? "validate",
    lastSchemaAction ? actionState[lastSchemaAction] : activeSchemaAction ? actionState[activeSchemaAction] : actionState.validate
  );

  useEffect(
    () => () => {
      schemaActionAbortControllerRef.current?.abort();
    },
    []
  );

  async function refreshSchemas() {
    const response = await api.listSchemas();
    const mapped = normalizeSchemaCatalog(response.items, schemaRecords, schemaVersionsById);

    setApiSchemaRecords(mapped.records);
    setApiSchemaVersionsById(mapped.versionsById);
    setSelectedSchemaId((currentId) => {
      const stillExists = mapped.records.some((schema) => schema.id === currentId);
      return stillExists ? currentId : mapped.records[0]?.id ?? fallbackSchemaId;
    });
    setSelectedVersionId((currentVersionId) => {
      const allVersions = Object.values(mapped.versionsById).flat();
      const stillExists = allVersions.some((version) => version.id === currentVersionId);
      return stillExists ? currentVersionId : allVersions[0]?.id ?? "";
    });

    return { response, mapped };
  }

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
        const mapped = normalizeSchemaCatalog(response.items, schemaRecords, schemaVersionsById);

        if (shouldIgnore) {
          return;
        }

        setApiSchemaRecords(mapped.records);
        setApiSchemaVersionsById(mapped.versionsById);
        setSelectedSchemaId((currentId) => {
          const stillExists = mapped.records.some((schema) => schema.id === currentId);
          return stillExists ? currentId : mapped.records[0]?.id ?? fallbackSchemaId;
        });
        setSelectedVersionId((currentVersionId) => {
          const allVersions = Object.values(mapped.versionsById).flat();
          const stillExists = allVersions.some((version) => version.id === currentVersionId);
          return stillExists ? currentVersionId : allVersions[0]?.id ?? "";
        });
        setApiSchemaState({
          status: "success",
          count: mapped.records.length > 0 ? mapped.records.length : response.items.length,
          statusSummary: summarizeSchemaVersionStatuses(response.items),
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
    const draftVersion = displayVersions.find((version) => version.status === "draft") ?? selectedVersion;
    const compareBase = displayVersions.find((version) => version.version === flowState.compareBase) ?? selectedVersion;

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
  }, [displayVersions, flowState.compareBase, selectedVersion]);

  const compareColumns: TableColumnProps<(typeof compareRows)[number]>[] = [
    { title: "指标", dataIndex: "metric" },
    { title: "草稿", dataIndex: "draft" },
    { title: "基线", dataIndex: "base" },
    {
      title: "影响",
      dataIndex: "impact",
      render: (_, row) => <Tag color={row.impact === "提升" || row.impact === "降低" ? "green" : "orange"}>{row.impact}</Tag>,
    },
  ];

  const handleSelectSchema = (schemaId: string) => {
    const nextSchema = displaySchemaRecords.find((schema) => schema.id === schemaId);
    const nextVersions = displaySchemaVersionsById[schemaId] ?? [];
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
    operation: (signal: AbortSignal) => Promise<unknown>,
    successMessage: string,
    fallbackError: string,
    onSuccess?: () => void
  ) => {
    schemaActionAbortControllerRef.current?.abort();
    const controller = new AbortController();
    schemaActionAbortControllerRef.current = controller;
    lastSchemaActionRef.current = { action };
    setActionState((currentState) => ({
      ...currentState,
      [action]: {
        isRunning: true,
        message: "",
        error: ""
      }
    }));

    try {
      await operation(controller.signal);
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
      if (isAbortError(error)) {
        setActionState((currentState) => ({
          ...currentState,
          [action]: {
            isRunning: false,
            message: "",
            error: "操作已取消，可重试上一次 Schema 请求。"
          }
        }));
        return;
      }

      setActionState((currentState) => ({
        ...currentState,
        [action]: {
          isRunning: false,
          message: "",
          error: formatApiError(error, fallbackError)
        }
      }));
    } finally {
      if (schemaActionAbortControllerRef.current === controller) {
        schemaActionAbortControllerRef.current = null;
      }
    }
  };

  const handleValidateDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "validate",
      async (signal) => {
        const response = await api.validateSchemaDraft(draftId, { definition: buildDraftDefinition(draftFields) }, { signal });
        setCurrentValidationResults(parseSchemaValidationResults(response));
        return response;
      },
      `已提交 ${selectedSchema.draftVersion} 的真实验证请求。`,
      "草稿验证失败，请稍后重试。"
    );
  };

  const handlePublishDraft = () => {
    const draftId = selectedDraftVersion?.id ?? selectedSchema.draftVersion;

    setPendingDangerAction(null);
    void runSchemaAction(
      "publish",
      (signal) => api.publishSchemaDraft(draftId, `${selectedSchema.name} 从 Schema Studio 发布`, { signal }),
      `已提交 ${selectedSchema.draftVersion} 的发布请求。`,
      "草稿发布失败，请确认权限和草稿状态。",
      () =>
        setFlowState((currentState) => ({
          ...currentState,
          publishRequested: true
        }))
    );
  };

  const executeDeactivateVersion = () => {
    if (!selectedVersion) {
      return;
    }

    setPendingDangerAction(null);
    void runSchemaAction(
      "deactivate",
      (signal) => api.deactivateSchemaVersion(selectedVersion.id, { signal }),
      `已提交 ${selectedVersion.version} 的真实停用请求。`,
      "Schema 停用失败，请确认权限和版本状态。",
      () => {
        setFlowState((currentState) => ({
          ...currentState,
          deactivateRequested: true
        }));
        void refreshSchemas();
      }
    );
  };

  const handleRollbackTargetChange = (rollbackTarget: string) => {
    setFlowState((currentState) => ({
      ...currentState,
      rollbackTarget
    }));
  };

  const executeRollbackVersion = () => {
    const rollbackTarget = flowState.rollbackTarget;
    const targetVersion = displayVersions.find((version) => version.version === rollbackTarget);
    if (!targetVersion) {
      return;
    }

    setPendingDangerAction(null);
    void runSchemaAction(
      "rollback",
      (signal) => api.rollbackSchemaVersion(targetVersion.id, { signal }),
      `已提交 ${rollbackTarget} 的真实回滚请求。`,
      "Schema 回滚失败，请确认目标版本仍存在。",
      () => {
        void refreshSchemas();
      }
    );
  };

  const handleCompareVersions = () => {
    const draftVersion = selectedDraftVersion?.version ?? selectedSchema.draftVersion;

    void runSchemaAction(
      "compare",
      (signal) =>
        api.compareSchemaVersions(selectedSchema.id, {
          left: draftVersion,
          right: flowState.compareBase
        }, { signal }),
      `已完成 ${draftVersion} 与 ${flowState.compareBase} 的真实比较请求。`,
      "版本比较失败，请确认版本号仍存在。"
    );
  };

  const handleCancelSchemaAction = () => {
    schemaActionAbortControllerRef.current?.abort();
  };

  const handleRetrySchemaAction = () => {
    const lastAction = lastSchemaActionRef.current?.action;
    if (!lastAction || activeSchemaAction !== null) {
      return;
    }

    if (lastAction === "validate") {
      handleValidateDraft();
      return;
    }
    if (lastAction === "publish") {
      setPendingDangerAction("publish");
      return;
    }
    if (lastAction === "deactivate") {
      setPendingDangerAction("deactivate");
      return;
    }
    if (lastAction === "rollback") {
      setPendingDangerAction("rollback");
      return;
    }

    handleCompareVersions();
  };

  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Schema Studio</p>
          <h1>Schema 管理</h1>
          <p>面向医疗结构化抽取的 Schema 版本、草稿、验证与生产变更控制台。</p>
          <div className="page-header__meta" aria-label="Schema 生产控制摘要">
            <span className="page-header__meta-item">
              <strong>生产版本</strong>
              <span>{selectedSchema.activeVersion}</span>
            </span>
            <span className="page-header__meta-item">
              <strong>草稿版本</strong>
              <span>{selectedSchema.draftVersion}</span>
            </span>
            <span className="page-header__meta-item">
              <strong>影响管道</strong>
              <span>{selectedSchema.affectedPipelines.join("、")}</span>
            </span>
          </div>
        </div>
        <Tag color="arcoblue" className="status-pill">
          <AppIcon icon={dashboardMetricIcons.dataset} size="sm" />
          {selectedSchema.domain}
        </Tag>
      </header>

      <Alert
        type="warning"
        showIcon
        title="生产影响提示"
        content={`当前草稿会影响 ${selectedSchema.affectedPipelines.join("、")}。发布、停用或回滚前请确认验证结果和业务窗口。`}
      />

      <div className="metric-grid">
        <Card className="metric-card">
          <Tag color="green">Active</Tag>
          <h2>{selectedSchema.activeVersion}</h2>
          <p>当前生产版本</p>
        </Card>
        <Card className="metric-card">
          <Tag color="orange">Draft</Tag>
          <h2>{selectedSchema.draftVersion}</h2>
          <p>待发布草稿</p>
        </Card>
        <Card className="metric-card">
          <Tag color="arcoblue">
            {apiSchemaState.status === "loading" ? (
              <AppIcon icon={commonUiIcons.loading} size="xs" />
            ) : null}
            API Schema
          </Tag>
          <h2>{apiSchemaState.status === "loading" ? "读取中" : displaySchemaRecords.length}</h2>
          <p>{apiSchemaState.statusSummary}</p>
        </Card>
      </div>

      {apiSchemaState.error ? (
        <Alert type="warning" showIcon content={`Schema 列表加载失败：${apiSchemaState.error}。下方静态 Schema 列表仍可继续使用。`} />
      ) : null}

      <Card className="panel" aria-labelledby="schema-async-recovery-title">
        <div className="panel-header">
          <h2 id="schema-async-recovery-title">Schema 异步操作恢复</h2>
          <div className="u-cluster">
            <Button type="outline" disabled={activeSchemaAction === null} onClick={handleCancelSchemaAction}>
              取消当前操作
            </Button>
            <Button type="outline" disabled={!schemaRecoveryDescriptor.canRetry || activeSchemaAction !== null} onClick={handleRetrySchemaAction}>
              重试上次操作
            </Button>
          </div>
        </div>
        <Alert
          type={schemaRecoveryDescriptor.tone === "warning" ? "warning" : schemaRecoveryDescriptor.tone === "success" ? "success" : "info"}
          showIcon
          title={schemaRecoveryDescriptor.title}
          content={schemaRecoveryDescriptor.message}
        />
      </Card>

      <div className="form-grid">
        <SchemaListPanel
          schemas={displaySchemaRecords}
          selectedSchemaId={selectedSchemaId}
          onSelectSchema={handleSelectSchema}
        />
        <VersionListPanel
          versions={displayVersions}
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
        results={currentValidationResults}
        actionState={actionState.validate}
        onValidate={handleValidateDraft}
      />

      <SchemaFlowPanel
        schema={selectedSchema}
        versions={displayVersions}
        canPublish={canPublish}
        flowState={flowState}
        actionState={{
          publish: actionState.publish,
          compare: actionState.compare,
          deactivate: actionState.deactivate,
          rollback: actionState.rollback
        }}
        onPublish={() => setPendingDangerAction("publish")}
        onDeactivate={() => setPendingDangerAction("deactivate")}
        onRollbackTargetChange={handleRollbackTargetChange}
        onRollback={() => setPendingDangerAction("rollback")}
        onCompareBaseChange={(compareBase) =>
          setFlowState((currentState) => ({
            ...currentState,
            compareBase
          }))
        }
        onCompare={handleCompareVersions}
      />

      {actionState.deactivate.error || actionState.deactivate.message || actionState.rollback.error || actionState.rollback.message ? (
        <Card className="panel" aria-labelledby="schema-change-result-title">
          <h2 id="schema-change-result-title">真实变更请求状态</h2>
          {actionState.deactivate.error ? (
            <Alert type="error" showIcon content={`停用失败：${actionState.deactivate.error}`} />
          ) : null}
          {actionState.deactivate.message ? <p>{actionState.deactivate.message}</p> : null}
          {actionState.rollback.error ? (
            <Alert type="error" showIcon content={`回滚失败：${actionState.rollback.error}`} />
          ) : null}
          {actionState.rollback.message ? <p>{actionState.rollback.message}</p> : null}
        </Card>
      ) : null}

      <Card className="panel" aria-labelledby="schema-compare-title">
        <div className="toolbar">
          <div>
            <h2 id="schema-compare-title">版本比较</h2>
            <p>展示草稿与基线版本的关键生产指标差异。</p>
          </div>
          <AppIcon icon={navigationIcons.schemaStudio} tone="purple" tile />
        </div>

        <Table columns={compareColumns} data={compareRows} rowKey="metric" pagination={false} scroll={{ x: 720 }} />
      </Card>
      <ConfirmDialog
        open={pendingDangerAction === "publish"}
        title="确认发布 Schema 草稿"
        description={`将把 ${selectedSchema.name} 的 ${selectedSchema.draftVersion} 发布为生产版本。该动作会影响 ${selectedSchema.affectedPipelines.join("、")}，并写入审计记录。`}
        confirmLabel="确认发布"
        danger
        onCancel={() => setPendingDangerAction(null)}
        onConfirm={handlePublishDraft}
      />
      <ConfirmDialog
        open={pendingDangerAction === "deactivate"}
        title="确认停用 Schema 版本"
        description={`将停用 ${selectedVersion?.version ?? selectedSchema.activeVersion}。该动作会影响 ${selectedSchema.affectedPipelines.join("、")}，并写入审计记录。`}
        confirmLabel="确认停用"
        danger
        onCancel={() => setPendingDangerAction(null)}
        onConfirm={executeDeactivateVersion}
      />
      <ConfirmDialog
        open={pendingDangerAction === "rollback"}
        title="确认回滚 Schema 版本"
        description={`将 ${selectedSchema.name} 回滚到 ${flowState.rollbackTarget}。该动作会改变生产抽取策略，并写入审计记录。`}
        confirmLabel="确认回滚"
        danger
        onCancel={() => setPendingDangerAction(null)}
        onConfirm={executeRollbackVersion}
      />
    </main>
  );
}
