import { useState } from 'react';
import {
  Card,
  Tag,
  Input,
  Select,
  Space,
  Typography,
  Button,
  Divider,
  Popconfirm,
} from '@arco-design/web-react';
import { toast } from './GlobalToast';
import {
  IconEdit,
  IconCheck,
  IconClose,
  IconPlus,
  IconDelete,
} from '@arco-design/web-react/icon';
import type { SchemaField, FieldStatItem, KnowledgeEntry } from '../api/types';
import {
  useKnowledgeList,
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
} from '../hooks/useKnowledge';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface FieldCardProps {
  field: SchemaField;
  stats?: FieldStatItem;
  onUpdate: (key: string, updates: Partial<SchemaField>) => void;
}

export default function FieldCard({ field, stats, onUpdate }: FieldCardProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(field.label || '');
  const [editType, setEditType] = useState(field.type || 'string');
  const [editLimsPath, setEditLimsPath] = useState(field.adapterHints?.limsTargetPath || '');
  const [editComments, setEditComments] = useState(
    Array.isArray(field.comments) ? field.comments.join('\n') : (field.comments || '')
  );
  const [editWritebackMode, setEditWritebackMode] = useState(
    (field.adapterHints as Record<string, unknown>)?.writebackMode as string || 'preview'
  );
  const [editEnumMap, setEditEnumMap] = useState(
    field.enumMap ? Object.entries(field.enumMap).map(([k, v]) => `${k}:${v}`).join('\n') : ''
  );

  // Knowledge
  const { data: knowledgeData } = useKnowledgeList({ fieldKey: field.key });
  const createKnowledge = useCreateKnowledge();
  const updateKnowledge = useUpdateKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const knowledgeEntries = knowledgeData?.entries || [];

  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [newKwTitle, setNewKwTitle] = useState('');
  const [newKwContent, setNewKwContent] = useState('');
  const [newKwKind, setNewKwKind] = useState<string>('field_description');

  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [editKwTitle, setEditKwTitle] = useState('');
  const [editKwContent, setEditKwContent] = useState('');

  const handleSave = () => {
    const updates: Partial<SchemaField> = {
      label: editLabel,
      type: editType,
    };
    if (editType === 'enum' && editEnumMap.trim()) {
      const enumMap: Record<string, string> = {};
      for (const line of editEnumMap.split('\n')) {
        const [k, ...rest] = line.split(':');
        if (k && rest.length > 0) {
          enumMap[k.trim()] = rest.join(':').trim();
        }
      }
      updates.enumMap = enumMap;
    }
    updates.adapterHints = {
      ...field.adapterHints,
      limsTargetPath: editLimsPath || undefined,
      writebackMode: editWritebackMode,
    };
    updates.comments = editComments || undefined;
    onUpdate(field.key, updates);
    setEditing(false);
    toast.success(`字段 ${field.key} 已更新`);
  };

  const handleCancel = () => {
    setEditLabel(field.label || '');
    setEditType(field.type || 'string');
    setEditLimsPath(field.adapterHints?.limsTargetPath || '');
    setEditComments(Array.isArray(field.comments) ? field.comments.join('\n') : (field.comments || ''));
    setEditWritebackMode((field.adapterHints as Record<string, unknown>)?.writebackMode as string || 'preview');
    setEditEnumMap(field.enumMap ? Object.entries(field.enumMap).map(([k, v]) => `${k}:${v}`).join('\n') : '');
    setEditing(false);
  };

  const handleAddKnowledge = async () => {
    if (!newKwTitle.trim() || !newKwContent.trim()) {
      toast.warning('标题和内容不能为空');
      return;
    }
    try {
      await createKnowledge.mutateAsync({
        kind: newKwKind as KnowledgeEntry['kind'],
        title: newKwTitle,
        content: newKwContent,
        fieldKeys: [field.key],
        keywords: [],
      });
      toast.success('知识条目已添加');
      setAddingKnowledge(false);
      setNewKwTitle('');
      setNewKwContent('');
    } catch {
      toast.error('添加失败');
    }
  };

  const handleUpdateKnowledge = async (id: string) => {
    try {
      await updateKnowledge.mutateAsync({ id, title: editKwTitle, content: editKwContent });
      toast.success('知识条目已更新');
      setEditingKnowledgeId(null);
    } catch {
      toast.error('更新失败');
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await deleteKnowledge.mutateAsync(id);
      toast.success('知识条目已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const confidenceColor = stats?.avgConfidence != null
    ? stats.avgConfidence >= 0.8 ? 'green' : stats.avgConfidence >= 0.5 ? 'orange' : 'red'
    : undefined;

  return (
    <Card
      size="small"
      style={{ borderRadius: 8, border: '1px solid var(--color-border-2)' }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text bold style={{ fontSize: 14 }}>{field.label || field.key}</Text>
          <Text type="secondary" code style={{ fontSize: 12 }}>{field.key}</Text>
          {field.required && <Tag color="red" size="small">必填</Tag>}
          {field.critical && <Tag color="orange" size="small">关键</Tag>}
          {!editing && (
            <Button
              type="text"
              size="mini"
              icon={<IconEdit />}
              onClick={() => setEditing(true)}
              style={{ marginLeft: 'auto' }}
            />
          )}
        </div>
      }
      extra={editing ? (
        <Space size={4}>
          <Button type="primary" size="mini" icon={<IconCheck />} onClick={handleSave}>保存</Button>
          <Button size="mini" icon={<IconClose />} onClick={handleCancel}>取消</Button>
        </Space>
      ) : undefined}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 属性区域 */}
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>标签</Text>
              <Input size="small" value={editLabel} onChange={setEditLabel} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>类型</Text>
              <Select size="small" value={editType} onChange={setEditType} style={{ width: '100%' }}>
                <Option value="string">string</Option>
                <Option value="enum">enum</Option>
                <Option value="list">list</Option>
                <Option value="date">date</Option>
                <Option value="number">number</Option>
              </Select>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>LIMS 映射</Text>
              <Input size="small" value={editLimsPath} onChange={setEditLimsPath} placeholder="limsTargetPath" />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>写回模式</Text>
              <Select size="small" value={editWritebackMode} onChange={setEditWritebackMode} style={{ width: '100%' }}>
                <Option value="preview">preview</Option>
                <Option value="auto">auto</Option>
                <Option value="manual">manual</Option>
              </Select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>识别说明</Text>
              <TextArea
                value={editComments}
                onChange={setEditComments}
                rows={3}
                placeholder="用于 LLM 识别的提示说明"
              />
            </div>
            {editType === 'enum' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>枚举值（每行 key:value）</Text>
                <TextArea
                  value={editEnumMap}
                  onChange={setEditEnumMap}
                  rows={3}
                  placeholder={'male:男\nfemale:女'}
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
            <div><Text type="secondary">类型：</Text><Text>{field.type || '-'}</Text></div>
            <div>
              <Text type="secondary">LIMS：</Text>
              {field.adapterHints?.limsTargetPath
                ? <Text code style={{ fontSize: 12 }}>{field.adapterHints.limsTargetPath}</Text>
                : <Text type="secondary">-</Text>
              }
            </div>
            {Boolean((field.adapterHints as Record<string, unknown>)?.writebackMode) && (
              <div>
                <Text type="secondary">写回：</Text>
                <Tag size="small">{String((field.adapterHints as Record<string, unknown>).writebackMode)}</Tag>
              </div>
            )}
            {field.comments && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Text type="secondary">识别说明：</Text>
                <Text style={{ fontSize: 12 }}>
                  {Array.isArray(field.comments) ? field.comments.join('；') : field.comments}
                </Text>
              </div>
            )}
            {field.enumMap && Object.keys(field.enumMap).length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Text type="secondary">枚举：</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {Object.entries(field.enumMap).map(([k, v]) => (
                    <Tag key={k} size="small" color="blue">{k}→{v}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        {/* 关联知识区域 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>关联知识</Text>
            {!addingKnowledge && (
              <Button type="text" size="mini" icon={<IconPlus />} onClick={() => setAddingKnowledge(true)}>
                添加
              </Button>
            )}
          </div>

          {addingKnowledge && (
            <Card size="small" style={{ marginBottom: 8, background: 'var(--color-fill-1)' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Select size="small" value={newKwKind} onChange={setNewKwKind} style={{ width: 140 }}>
                    <Option value="field_description">字段说明</Option>
                    <Option value="medical_term">医学术语</Option>
                    <Option value="cancer_alias">肿瘤别名</Option>
                    <Option value="lims_dictionary">LIMS 字典</Option>
                  </Select>
                  <Input size="small" placeholder="标题" value={newKwTitle} onChange={setNewKwTitle} style={{ flex: 1 }} />
                </div>
                <TextArea placeholder="内容" value={newKwContent} onChange={setNewKwContent} rows={2} />
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <Button size="mini" onClick={() => setAddingKnowledge(false)}>取消</Button>
                  <Button type="primary" size="mini" loading={createKnowledge.isPending} onClick={handleAddKnowledge}>
                    保存
                  </Button>
                </div>
              </Space>
            </Card>
          )}

          {knowledgeEntries.length === 0 && !addingKnowledge ? (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无关联知识</Text>
          ) : (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {knowledgeEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: 'var(--color-fill-1)',
                    fontSize: 12,
                  }}
                >
                  {editingKnowledgeId === entry.id ? (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Input size="small" value={editKwTitle} onChange={setEditKwTitle} />
                      <TextArea value={editKwContent} onChange={setEditKwContent} rows={2} />
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button size="mini" onClick={() => setEditingKnowledgeId(null)}>取消</Button>
                        <Button
                          type="primary"
                          size="mini"
                          loading={updateKnowledge.isPending}
                          onClick={() => handleUpdateKnowledge(entry.id)}
                        >
                          保存
                        </Button>
                      </div>
                    </Space>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <Tag size="small" color="gray" style={{ marginRight: 4 }}>{entry.kind}</Tag>
                        <Text bold style={{ fontSize: 12 }}>{entry.title}</Text>
                        <div style={{ color: 'var(--color-text-3)', marginTop: 2 }}>{entry.content}</div>
                      </div>
                      <Space size={0}>
                        <Button
                          type="text"
                          size="mini"
                          icon={<IconEdit />}
                          onClick={() => {
                            setEditingKnowledgeId(entry.id);
                            setEditKwTitle(entry.title);
                            setEditKwContent(entry.content);
                          }}
                        />
                        <Popconfirm
                          title="确定删除此知识条目？"
                          onOk={() => handleDeleteKnowledge(entry.id)}
                        >
                          <Button type="text" size="mini" status="danger" icon={<IconDelete />} />
                        </Popconfirm>
                      </Space>
                    </div>
                  )}
                </div>
              ))}
            </Space>
          )}
        </div>

        <Divider style={{ margin: '4px 0' }} />

        {/* 识别统计区域 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            识别统计
          </Text>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#3370FF' }}>{stats.recognitionCount}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>识别次数</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                {stats.avgConfidence != null && confidenceColor ? (
                  <Tag color={confidenceColor} style={{ fontSize: 16, fontWeight: 700 }}>
                    {(stats.avgConfidence * 100).toFixed(0)}%
                  </Tag>
                ) : (
                  <Text type="secondary">-</Text>
                )}
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>置信度均值</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: stats.reviewCount > 0 ? '#FF7D00' : '#4E5969' }}>
                  {stats.reviewCount}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>需复核</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: stats.correctionCount > 0 ? '#F53F3F' : '#4E5969' }}>
                  {stats.correctionCount}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>修正次数</Text>
              </div>
              {stats.commonErrors.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>常见错误：</Text>
                  {stats.commonErrors.slice(0, 3).map((err, i) => (
                    <Tag key={i} size="small" color="red" style={{ margin: '2px 4px 2px 0', fontSize: 11 }}>
                      {err.original} → {err.corrected} ({err.count}次)
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '12px 0', textAlign: 'center', background: 'var(--color-fill-1)', borderRadius: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无统计数据 - 运行识别任务后将显示此字段的使用情况
              </Text>
            </div>
          )}
        </div>
      </Space>
    </Card>
  );
}
