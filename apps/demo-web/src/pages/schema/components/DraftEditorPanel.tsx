import { Button, Card, Form, Input, Space, Tag } from "@arco-design/web-react";
import { AppIcon, actionIcons, dashboardMetricIcons, statusIcons } from "../../../icons/appIcons";
import type { SchemaFieldDraft } from "./schemaStudioData";

type DraftEditorPanelProps = {
  fields: SchemaFieldDraft[];
  onUpdateField: (
    fieldId: string,
    key: keyof Omit<SchemaFieldDraft, "id">,
    value: string
  ) => void;
  onAddField: () => void;
  onRemoveField: (fieldId: string) => void;
};

export function DraftEditorPanel({
  fields,
  onUpdateField,
  onAddField,
  onRemoveField
}: DraftEditorPanelProps) {
  return (
    <Card className="panel studio-panel" aria-labelledby="schema-draft-editor-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-draft-editor-title">草稿编辑器</h2>
          <p>维护字段 metadata、aliases、enumMap、validators、normalizers 与 adapter hints。</p>
        </div>
        <Button type="outline" onClick={onAddField} icon={<AppIcon icon={actionIcons.createRecognition} size="sm" />}>
          新增字段
        </Button>
      </div>

      <div className="form-grid">
        {fields.map((field, index) => (
          <fieldset className="studio-field-card" key={field.id}>
            <legend>
              <AppIcon icon={dashboardMetricIcons.schema} size="sm" />
              字段 {index + 1}
            </legend>

            <Form.Item label="字段名">
              <Input
                value={field.name}
                onChange={(value) => onUpdateField(field.id, "name", value)}
              />
            </Form.Item>

            <Form.Item label="Metadata">
              <Input.TextArea
                className="json-editor"
                value={field.metadata}
                onChange={(value) => onUpdateField(field.id, "metadata", value)}
              />
            </Form.Item>

            <Form.Item label="Aliases">
              <Input.TextArea
                className="json-editor"
                value={field.aliases}
                onChange={(value) => onUpdateField(field.id, "aliases", value)}
              />
            </Form.Item>

            <Form.Item label="Enum Map">
              <Input.TextArea
                className="json-editor"
                value={field.enumMap}
                onChange={(value) => onUpdateField(field.id, "enumMap", value)}
              />
            </Form.Item>

            <Form.Item label="Validators">
              <Input.TextArea
                className="json-editor"
                value={field.validators}
                onChange={(value) => onUpdateField(field.id, "validators", value)}
              />
            </Form.Item>

            <Form.Item label="Normalizers">
              <Input.TextArea
                className="json-editor"
                value={field.normalizers}
                onChange={(value) => onUpdateField(field.id, "normalizers", value)}
              />
            </Form.Item>

            <Form.Item label="Adapter Hints">
              <Input.TextArea
                className="json-editor"
                value={field.adapterHints}
                onChange={(value) => onUpdateField(field.id, "adapterHints", value)}
              />
            </Form.Item>

            <Space className="toolbar" wrap>
              <Tag color="gray">本地草稿</Tag>
              <Button
                status="danger"
                onClick={() => onRemoveField(field.id)}
                disabled={fields.length === 1}
                icon={<AppIcon icon={statusIcons.danger} size="sm" />}
              >
                删除
              </Button>
            </Space>
          </fieldset>
        ))}
      </div>
    </Card>
  );
}
