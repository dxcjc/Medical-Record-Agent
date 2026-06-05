import { History } from "lucide-react";
import type { SchemaVersion } from "./schemaStudioData";
import { statusLabels } from "./schemaStudioData";

type VersionListPanelProps = {
  versions: SchemaVersion[];
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
};

export function VersionListPanel({
  versions,
  selectedVersionId,
  onSelectVersion
}: VersionListPanelProps) {
  return (
    <section className="panel" aria-labelledby="schema-version-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-version-title">版本列表</h2>
          <p>选择草稿、生产或历史版本进行比较与回滚。</p>
        </div>
        <History aria-hidden size={20} />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">版本</th>
            <th scope="col">状态</th>
            <th scope="col">覆盖率</th>
            <th scope="col">错误率</th>
            <th scope="col">更新时间</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const isSelected = version.id === selectedVersionId;

            return (
              <tr key={version.id}>
                <td>
                  <button
                    type="button"
                    className={isSelected ? "action-button" : "secondary-button"}
                    onClick={() => onSelectVersion(version.id)}
                    aria-pressed={isSelected}
                  >
                    {version.version}
                  </button>
                </td>
                <td>
                  <span className={`status-pill status-${version.status}`}>
                    {statusLabels[version.status]}
                  </span>
                </td>
                <td>{version.coverage.toFixed(1)}%</td>
                <td>{version.errorRate.toFixed(1)}%</td>
                <td>{version.updatedAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
