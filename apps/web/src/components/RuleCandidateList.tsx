import { useState } from "react";
import { Button, Tag, Space, Input, Typography, Collapse, Empty } from "@arco-design/web-react";
import { IconCheck, IconClose, IconEdit, IconMinus, IconRefresh } from "@arco-design/web-react/icon";
import type { RuleCandidate, RuleCandidateProposal } from "../api/types";
import { useRuleCandidates, useReviewCandidate, useExtractCandidates } from "../hooks/useRuleCandidates";

interface RuleCandidateListProps {
  schemaKey: string;
  fieldKey: string;
}

function proposalSummary(proposal: RuleCandidateProposal): string {
  if (proposal.type === "correction") {
    return `"${proposal.originalValue}" → "${proposal.correctedValue}"`;
  }
  return `${proposal.condition}，期望: ${proposal.expectedValue}`;
}

function CandidateItem({
  candidate,
  schemaKey,
  fieldKey,
}: {
  candidate: RuleCandidate;
  schemaKey: string;
  fieldKey: string;
}) {
  const reviewMutation = useReviewCandidate(schemaKey, fieldKey);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const isProposed = candidate.status === "proposed" || candidate.status === "skipped";

  const handleEditAccept = () => {
    let proposal = candidate.proposal;
    if (editText.trim()) {
      if (proposal.type === "correction") {
        proposal = { ...proposal, correctedValue: editText.trim() };
      } else {
        proposal = { ...proposal, condition: editText.trim() };
      }
    }
    reviewMutation.mutate({
      id: candidate.id,
      status: "accepted",
      proposal,
      proposalHash: undefined,
    });
    setEditing(false);
  };

  if (!isProposed) {
    return (
      <div style={{ padding: "8px 12px", opacity: 0.6 }}>
        <Tag color={candidate.status === "accepted" ? "green" : "red"} size="small">
          {candidate.status === "accepted" ? "已接受" : "已拒绝"}
        </Tag>
        <span style={{ marginLeft: 8, fontSize: 13 }}>
          [{candidate.ruleType === "correction" ? "纠偏" : "规则"}] {proposalSummary(candidate.proposal)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space size={8}>
          <Tag color={candidate.ruleType === "correction" ? "blue" : "purple"} size="small">
            {candidate.ruleType === "correction" ? "纠偏" : "规则"}
          </Tag>
          {candidate.status === "skipped" && <Tag color="gray" size="small">已跳过</Tag>}
          <Typography.Text style={{ fontSize: 13 }}>
            {proposalSummary(candidate.proposal)}
          </Typography.Text>
        </Space>
        <Space size={4}>
          <Button
            size="mini"
            type="text"
            icon={<IconEdit />}
            onClick={() => {
              setEditing(true);
              setEditText(candidate.proposal.type === "correction" ? candidate.proposal.correctedValue : candidate.proposal.condition);
            }}
          />
          <Button
            size="mini"
            type="text"
            status="success"
            icon={<IconCheck />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "accepted" })}
          />
          <Button
            size="mini"
            type="text"
            status="danger"
            icon={<IconClose />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "rejected" })}
          />
          <Button
            size="mini"
            type="text"
            icon={<IconMinus />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "skipped" })}
          />
        </Space>
      </div>
      {editing && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <Input
            size="small"
            value={editText}
            onChange={setEditText}
            placeholder="编辑候选内容"
          />
          <Button size="small" type="primary" onClick={handleEditAccept}>保存并接受</Button>
          <Button size="small" onClick={() => setEditing(false)}>取消</Button>
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-3)" }}>
        证据: {candidate.evidence.length} 条
      </div>
    </div>
  );
}

export default function RuleCandidateList({ schemaKey, fieldKey }: RuleCandidateListProps) {
  const { data, isLoading } = useRuleCandidates(schemaKey, fieldKey);
  const extractMutation = useExtractCandidates(schemaKey);

  const candidates = data?.items ?? [];
  const activeCandidates = candidates.filter(c => c.status === "proposed" || c.status === "skipped");
  const historyCandidates = candidates.filter(c => c.status === "accepted" || c.status === "rejected");

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          知识候选 ({activeCandidates.length})
        </Typography.Text>
        <Button
          size="mini"
          type="text"
          icon={<IconRefresh />}
          loading={extractMutation.isPending}
          onClick={() => extractMutation.mutate()}
        >
          提炼
        </Button>
      </div>

      {isLoading ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>加载中...</Typography.Text>
      ) : activeCandidates.length === 0 && historyCandidates.length === 0 ? (
        <Empty description="暂无知识候选" />
      ) : (
        <>
          {activeCandidates.map(c => (
            <CandidateItem key={c.id} candidate={c} schemaKey={schemaKey} fieldKey={fieldKey} />
          ))}
          {historyCandidates.length > 0 && (
            <Collapse style={{ marginTop: 8 }}>
              <Collapse.Item name="history" header={`历史记录 (${historyCandidates.length})`}>
                {historyCandidates.map(c => (
                  <CandidateItem key={c.id} candidate={c} schemaKey={schemaKey} fieldKey={fieldKey} />
                ))}
              </Collapse.Item>
            </Collapse>
          )}
        </>
      )}
    </div>
  );
}
