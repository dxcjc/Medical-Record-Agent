import { Card, Tag } from "@arco-design/web-react";
import { AppIcon, dashboardMetricIcons, navigationIcons } from "../../../icons/appIcons";
import type { MetricCardData } from "./evaluationData";

type MetricCardsPanelProps = {
  metrics: MetricCardData[];
};

export function MetricCardsPanel({ metrics }: MetricCardsPanelProps) {
  return (
    <Card className="panel studio-panel" aria-labelledby="evaluation-metrics-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-metrics-title">Metric Cards</h2>
          <p>候选版本的关键评测指标和相对基线变化。</p>
        </div>
        <AppIcon icon={navigationIcons.evaluation} tone="blue" tile />
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <Card className="metric-card" key={metric.id}>
            <div className="toolbar">
              <Tag color="arcoblue">
                <AppIcon icon={dashboardMetricIcons.confidence} size="xs" />
                {metric.label}
              </Tag>
              <strong>{metric.delta}</strong>
            </div>
            <h3>{metric.value}</h3>
            <p>{metric.detail}</p>
          </Card>
        ))}
      </div>
    </Card>
  );
}
