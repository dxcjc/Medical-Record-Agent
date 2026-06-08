import { AppIcon, navigationIcons } from "../../../icons/appIcons";
import type { SchemaRecord } from "./schemaStudioData";

type SchemaListPanelProps = {
  schemas: SchemaRecord[];
  selectedSchemaId: string;
  onSelectSchema: (schemaId: string) => void;
};

export function SchemaListPanel({
  schemas,
  selectedSchemaId,
  onSelectSchema
}: SchemaListPanelProps) {
  return (
    <section className="panel studio-panel" aria-labelledby="schema-list-title" data-guide="schema-selection">
      <div className="toolbar">
        <div>
          <h2 id="schema-list-title">Schema 列表</h2>
          <p>按业务域查看当前生产版本与待发布草稿。</p>
        </div>
        <AppIcon icon={navigationIcons.schemaStudio} tone="blue" tile />
      </div>

      <div className="table-scroll">
        <table className="data-table arco-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">业务域</th>
              <th scope="col">生产版本</th>
              <th scope="col">责任组</th>
            </tr>
          </thead>
          <tbody>
            {schemas.map((schema) => {
              const isSelected = schema.id === selectedSchemaId;

              return (
                <tr className={isSelected ? "is-selected" : undefined} key={schema.id}>
                  <td>
                    <button
                      type="button"
                      className={isSelected ? "action-button" : "secondary-button"}
                      onClick={() => onSelectSchema(schema.id)}
                      aria-pressed={isSelected}
                    >
                      {schema.name}
                    </button>
                  </td>
                  <td><span className="status-pill status-pill--info">{schema.domain}</span></td>
                  <td className="mono">{schema.activeVersion}</td>
                  <td>{schema.owner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
