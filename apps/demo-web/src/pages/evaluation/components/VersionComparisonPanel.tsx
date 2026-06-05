import { GitCompare } from "lucide-react";
import type { VersionComparisonRow } from "./evaluationData";

type VersionComparisonPanelProps = {
  rows: VersionComparisonRow[];
};

export function VersionComparisonPanel({ rows }: VersionComparisonPanelProps) {
  return (
    <section className="panel" aria-labelledby="evaluation-comparison-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-comparison-title">Version Comparison</h2>
          <p>生产基线与候选版本在核心指标上的差异。</p>
        </div>
        <GitCompare aria-hidden size={20} />
      </div>

      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col">指标</th>
            <th scope="col">生产基线</th>
            <th scope="col">候选版本</th>
            <th scope="col">结论</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.metric}>
              <td>{row.metric}</td>
              <td>{row.baseline}</td>
              <td>{row.candidate}</td>
              <td>
                <span className="status-pill">{row.verdict}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
