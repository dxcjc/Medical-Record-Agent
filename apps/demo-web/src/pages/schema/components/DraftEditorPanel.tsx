import { FilePenLine, Plus, Trash2 } from "lucide-react";
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
    <section className="panel" aria-labelledby="schema-draft-editor-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-draft-editor-title">草稿编辑器</h2>
          <p>维护字段 metadata、aliases、enumMap、validators、normalizers 与 adapter hints。</p>
        </div>
        <button type="button" className="secondary-button" onClick={onAddField}>
          <Plus aria-hidden size={16} />
          新增字段
        </button>
      </div>

      <div className="form-grid">
        {fields.map((field, index) => (
          <fieldset className="panel" key={field.id}>
            <legend>
              <FilePenLine aria-hidden size={16} />
              字段 {index + 1}
            </legend>

            <label>
              字段名
              <input
                value={field.name}
                onChange={(event) =>
                  onUpdateField(field.id, "name", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Metadata
              <textarea
                className="json-editor"
                value={field.metadata}
                onChange={(event) =>
                  onUpdateField(field.id, "metadata", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Aliases
              <textarea
                className="json-editor"
                value={field.aliases}
                onChange={(event) =>
                  onUpdateField(field.id, "aliases", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Enum Map
              <textarea
                className="json-editor"
                value={field.enumMap}
                onChange={(event) =>
                  onUpdateField(field.id, "enumMap", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Validators
              <textarea
                className="json-editor"
                value={field.validators}
                onChange={(event) =>
                  onUpdateField(field.id, "validators", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Normalizers
              <textarea
                className="json-editor"
                value={field.normalizers}
                onChange={(event) =>
                  onUpdateField(field.id, "normalizers", event.currentTarget.value)
                }
              />
            </label>

            <label>
              Adapter Hints
              <textarea
                className="json-editor"
                value={field.adapterHints}
                onChange={(event) =>
                  onUpdateField(field.id, "adapterHints", event.currentTarget.value)
                }
              />
            </label>

            <div className="toolbar">
              <span className="status-pill">本地草稿</span>
              <button
                type="button"
                className="danger-button"
                onClick={() => onRemoveField(field.id)}
                disabled={fields.length === 1}
              >
                <Trash2 aria-hidden size={16} />
                删除
              </button>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
