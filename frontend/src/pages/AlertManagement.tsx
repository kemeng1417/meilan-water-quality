import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Select, Tag, Button, Space, Typography, Modal, Input, message,
  Empty, Row, Col, Statistic, DatePicker, Badge, Tooltip, Popconfirm, Segmented,
} from 'antd';
import {
  CheckOutlined, WarningOutlined, EnvironmentOutlined, EditOutlined,
  ExportOutlined, ClearOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import {
  getAlerts, updateAlert, batchResolveAlerts, getAlertSummary, getAlertFilterOptions,
  getAlertTemplates, exportAlerts, getUnresolvedAlertCount, getAlertWeeklyTrend,
} from '../api/endpoints';
import client from '../api/client';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const SEVERITY_MAP: Record<string, { color: string; label: string }> = {
  minor: { color: 'orange', label: '轻微' },
  moderate: { color: 'volcano', label: '中度' },
  severe: { color: 'red', label: '严重' },
};

const LS_FILTERS = 'alert_filters';

export default function AlertManagement() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserName = user.display_name || '';

  // Filter persistence
  const savedFilters = (() => { try { return JSON.parse(localStorage.getItem(LS_FILTERS) || '{}'); } catch { return {}; } })();

  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown>>({ page: 1, page_size: 20, ...savedFilters });
  const [summary, setSummary] = useState<any>({});
  const [filterOpts, setFilterOpts] = useState<any>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<{ date: string; count: number }[]>([]);
  const [dateQuick, setDateQuick] = useState<string>('');

  // Resolve modal
  const [modalOpen, setModalOpen] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<any>(null);
  const [actionText, setActionText] = useState('');

  // Edit modal (for already resolved)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editText, setEditText] = useState('');

  // Detail modal (view full info)
  const [detailOpen, setDetailOpen] = useState(false);

  // Batch modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchActionText, setBatchActionText] = useState('');

  // Badge
  const [badgeCount, setBadgeCount] = useState(0);

  const fetchData = useCallback(() => {
    setLoading(true);
    getAlerts(filters).then(res => {
      setData(res.data);
      setSelectedRowKeys([]);
    }).finally(() => setLoading(false));
  }, [filters]);

  const fetchSummary = () => {
    getAlertSummary().then(res => setSummary(res.data));
    getAlertFilterOptions().then(res => setFilterOpts(res.data));
    getAlertTemplates().then(res => setTemplates(res.data));
    getUnresolvedAlertCount().then(res => setBadgeCount(res.data.unresolved));
    getAlertWeeklyTrend().then(res => setWeeklyTrend(res.data));
  };

  // Filter persistence: save to localStorage on change
  const updateFilters = (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    setFilters(prev => {
      const next = fn(prev);
      const toSave: Record<string, unknown> = {};
      for (const k of ['status', 'water_type_id', 'indicator_id', 'sample_point_id', 'severity', 'start_date', 'end_date']) {
        if (next[k] !== undefined && next[k] !== null && next[k] !== '') toSave[k] = next[k];
      }
      localStorage.setItem(LS_FILTERS, JSON.stringify(toSave));
      return next;
    });
  };

  // Quick date filter
  const handleDateQuick = (val: string) => {
    setDateQuick(val || '');
    const today = dayjs();
    let start = '';
    if (val === 'today') start = today.format('YYYY-MM-DD');
    else if (val === 'week') start = today.subtract(7, 'day').format('YYYY-MM-DD');
    else if (val === 'month') start = today.startOf('month').format('YYYY-MM-DD');
    updateFilters(f => ({ ...f, page: 1, start_date: start || undefined, end_date: val ? today.format('YYYY-MM-DD') : undefined }));
  };

  useEffect(() => { fetchData(); fetchSummary(); }, [filters]);

  const refreshAll = () => { fetchData(); fetchSummary(); };

  // Resolve (unresolved → mark as resolved)
  const handleResolve = async () => {
    try {
      await updateAlert(currentAlert.id, { corrective_action: actionText, resolved: true, resolved_by: currentUserName });
      message.success('已处理');
      setModalOpen(false); setActionText('');
      refreshAll();
    } catch { message.error('操作失败'); }
  };

  // Edit corrective action (already resolved)
  const handleEditAction = async () => {
    try {
      await updateAlert(currentAlert.id, { corrective_action: editText });
      message.success('整改措施已更新');
      setEditModalOpen(false);
      refreshAll();
    } catch { message.error('更新失败'); }
  };

  // Delete single alert
  const handleDelete = async (id: number) => {
    try {
      await client.delete(`/alerts/${id}`);
      message.success('已删除');
      refreshAll();
    } catch { message.error('删除失败'); }
  };

  const handleBatchResolve = async () => {
    try {
      const res = await batchResolveAlerts(selectedRowKeys, batchActionText, currentUserName);
      message.success(`已批量处理 ${res.data.resolved_count} 条告警`);
      setBatchModalOpen(false); setBatchActionText('');
      setSelectedRowKeys([]);
      refreshAll();
    } catch { message.error('批量处理失败'); }
  };

  const handleExport = () => {
    exportAlerts(filters).then(res => {
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `异常清单_${dayjs().format('YYYYMMDD')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    }).catch(() => message.error('导出失败'));
  };

  const columns = [
    {
      title: '报告编号', dataIndex: 'record_no', width: 130,
      render: (v: string, r: any) => (
        <Typography.Link onClick={() => window.open(`/records/${r.record_id}`, '_blank')}>
          <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text>
        </Typography.Link>
      ),
    },
    { title: '日期', dataIndex: 'test_date', width: 95 },
    {
      title: '采样点', dataIndex: 'sample_point_name', width: 150, ellipsis: true,
      render: (v: string) => <span><EnvironmentOutlined style={{ color: '#94a3b8', marginRight: 4 }} />{v}</span>,
    },
    { title: '指标', dataIndex: 'indicator_name', width: 80,
      render: (v: string, r: any) => {
        // Check repeat: same point+indicator appears multiple times in result set
        const repeatCount = data.items.filter((x: any) =>
          x.sample_point_id === r.sample_point_id && x.indicator_id === r.indicator_id
        ).length;
        return (
          <span>
            {v}
            {repeatCount > 1 && (
              <Tooltip title={`此点位+指标已重复出现 ${repeatCount} 次`}>
                <Tag color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginLeft: 4, borderRadius: 8 }}>反复</Tag>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: '检测值', dataIndex: 'value_text', width: 120,
      render: (v: string, r: any) => {
        const s = SEVERITY_MAP[r.severity] || {};
        return (
          <span>
            <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:s.color||'#fa8c16', marginRight:6 }} />
            <Typography.Text strong style={{ color: '#ff4d4f', fontSize: 14 }}>{v}</Typography.Text>
          </span>
        );
      },
    },
    { title: '描述', dataIndex: 'description', ellipsis: true, width: 140,
      render: (v: string) => (
        <Tooltip title={v} placement="topLeft" overlayStyle={{ maxWidth: 400 }}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: '状态', dataIndex: 'resolved', width: 95,
      render: (v: boolean, r: any) => {
        if (r.verified) return <Tag color="processing" style={{ borderRadius: 6 }}>已验证</Tag>;
        if (v) return (
          <Tooltip title={r.resolved_by ? `处理人: ${r.resolved_by}` : ''}>
            <Tag color="success" style={{ borderRadius: 6 }}>已处理</Tag>
          </Tooltip>
        );
        return <Tag color="error" style={{ borderRadius: 6 }}><WarningOutlined /></Tag>;
      },
    },
    {
      title: '整改措施', dataIndex: 'corrective_action', width: 130,
      render: (v: string | null, r: any) => {
        if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tooltip title={v} placement="topLeft" overlayStyle={{ maxWidth: 420 }}>
            <Typography.Link onClick={() => { setCurrentAlert(r); setDetailOpen(true); }}
              style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 110 }}>
              <EyeOutlined style={{ marginRight: 2 }} />{v}
            </Typography.Link>
          </Tooltip>
        );
      },
    },
    {
      title: '操作', width: 100, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={2}>
          {!r.resolved ? (
            <Tooltip title="处理"><Button type="primary" size="small" icon={<CheckOutlined />}
              onClick={() => { setCurrentAlert(r); setModalOpen(true); setActionText(''); }}
              style={{ borderRadius: 6 }} /></Tooltip>
          ) : (
            <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />}
              onClick={() => { setCurrentAlert(r); setEditText(r.corrective_action || ''); setEditModalOpen(true); }} /></Tooltip>
          )}
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Stat cards
  const statItems = [
    { title: '待处理', value: summary.unresolved || 0, color: '#ff4d4f', icon: <WarningOutlined /> },
    { title: '本月新增', value: summary.this_month_new || 0, color: '#fa8c16' },
    { title: '已处理', value: summary.resolved || 0, color: '#52c41a', icon: <CheckOutlined /> },
    { title: '处理率', value: `${summary.resolution_rate || 100}%`, color: '#1677ff' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            <Badge count={badgeCount} offset={[8, 0]} size="small">
              <span style={{ paddingRight: 8 }}>异常管理</span>
            </Badge>
          </Typography.Title>
          <Typography.Text type="secondary">跟踪和处理水质检测中的超标项目</Typography.Text>
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
        </Space>
      </div>

      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {statItems.map((s, i) => (
          <Col span={6} key={i}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${s.color}` }}
              bodyStyle={{ padding: '12px 16px' }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 13 }}>{s.title}</Typography.Text>}
                value={s.value}
                valueStyle={{ color: s.color, fontSize: 24, fontWeight: 600 }}
                prefix={s.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Top issues */}
      {summary.top_indicators?.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '10px 20px' }}>
          <Space size="large" wrap>
            <span>
              <Typography.Text type="secondary">超标指标 Top：</Typography.Text>
              {summary.top_indicators.map((t: any, i: number) => (
                <Tag key={i} color="red" style={{ marginLeft: 4 }}>{t.indicator_name} ({t.count}次)</Tag>
              ))}
            </span>
            <span>
              <Typography.Text type="secondary">问题点位 Top：</Typography.Text>
              {summary.top_points?.slice(0, 5).map((t: any, i: number) => (
                <Tag key={i} color="orange" style={{ marginLeft: 4 }}>{t.sample_point_name} ({t.count}次)</Tag>
              ))}
            </span>
          </Space>
        </Card>
      )}

      {/* Quick Date + Trend Row */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card size="small" style={{ borderRadius: 10, background: '#fafafa', height: '100%' }}
            bodyStyle={{ padding: '10px 16px', display: 'flex', alignItems: 'center', height: '100%' }}>
            <Space align="center">
              <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>快捷日期</Typography.Text>
              <Segmented size="small" value={dateQuick} onChange={v => handleDateQuick(v as string)}
                options={[
                  { label: '全部', value: '' },
                  { label: '今天', value: 'today' },
                  { label: '近7天', value: 'week' },
                  { label: '本月', value: 'month' },
                ]} />
            </Space>
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '6px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>近7天趋势</Typography.Text>
              <Typography.Text style={{ fontSize: 11, color: '#1677ff', fontWeight: 500 }}>
                共 {weeklyTrend.reduce((s: number, d: any) => s + d.count, 0)} 条
              </Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 30, marginTop: 4 }}>
              {weeklyTrend.map((d, i) => {
                const max = Math.max(...weeklyTrend.map((x: any) => x.count), 1);
                const pct = (d.count / max) * 100;
                return (
                  <Tooltip key={i} title={`${d.date}: ${d.count} 条`}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11, color: d.count > 0 ? '#ff4d4f' : '#bbb', fontWeight: d.count > 0 ? 600 : 400, lineHeight: 1, minHeight: 14 }}>
                        {d.count > 0 ? d.count : ''}
                      </span>
                      <div style={{
                        width: '100%', maxWidth: 28,
                        height: Math.max(pct * 0.22, d.count > 0 ? 3 : 1),
                        minHeight: d.count > 0 ? 3 : 1,
                        borderRadius: 2,
                        background: d.count > 0 ? '#ff7875' : '#eee',
                      }} />
                      <span style={{ fontSize: 10, color: '#bbb', marginTop: 2, lineHeight: 1 }}>
                        {dayjs(d.date).format('D')}
                      </span>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '12px 20px' }}>
        <Space wrap>
          <Select placeholder="状态" allowClear style={{ width: 110 }} value={filters.status}
            onChange={v => updateFilters(f => ({ ...f, status: v, page: 1 }))}
            options={[{ label: '待处理', value: 'open' }, { label: '已处理', value: 'resolved' }]} />
          <Select placeholder="水样类型" allowClear style={{ width: 140 }} value={filters.water_type_id}
            onChange={v => updateFilters(f => ({ ...f, water_type_id: v, page: 1 }))}
            options={(filterOpts.water_types || []).map((w: any) => ({ label: w.name, value: w.id }))} />
          <Select placeholder="指标" allowClear showSearch style={{ width: 150 }} value={filters.indicator_id}
            onChange={v => updateFilters(f => ({ ...f, indicator_id: v, page: 1 }))}
            options={(filterOpts.indicators || []).map((i: any) => ({ label: i.name, value: i.id }))} />
          <Select placeholder="采样点" allowClear showSearch style={{ width: 180 }} value={filters.sample_point_id}
            onChange={v => updateFilters(f => ({ ...f, sample_point_id: v, page: 1 }))}
            options={(filterOpts.sample_points || []).map((p: any) => ({ label: `${p.code} ${p.name}`, value: p.id }))} />
          <Select placeholder="严重程度" allowClear style={{ width: 120 }} value={filters.severity}
            onChange={v => updateFilters(f => ({ ...f, severity: v, page: 1 }))}
            options={(filterOpts.severities || []).map((s: any) => ({ label: s.label, value: s.value }))} />
          <RangePicker
            placeholder={['开始日期', '结束日期']}
            style={{ borderRadius: 6 }}
            onChange={(dates) => {
              setDateQuick('');
              updateFilters(f => ({
                ...f, page: 1,
                start_date: dates?.[0]?.format('YYYY-MM-DD'),
                end_date: dates?.[1]?.format('YYYY-MM-DD'),
              }));
            }}
          />
          <Button icon={<ClearOutlined />} onClick={() => { setDateQuick(''); localStorage.removeItem(LS_FILTERS); setFilters({ page: 1, page_size: 20 }); }}>重置</Button>
        </Space>
      </Card>

      {/* Batch Actions */}
      {selectedRowKeys.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 10, background: '#e6f4ff', border: '1px solid #91caff' }}
          bodyStyle={{ padding: '8px 20px' }}>
          <Space>
            <Typography.Text strong>已选 {selectedRowKeys.length} 项</Typography.Text>
            <Button type="primary" size="small" icon={<CheckOutlined />}
              onClick={() => { setBatchModalOpen(true); setBatchActionText(''); }}>
              批量处理
            </Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        </Card>
      )}

      {/* Table */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          columns={columns} dataSource={data.items} rowKey="id" loading={loading}
          size="middle" scroll={{ x: 1080 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as number[]),
            getCheckboxProps: (r: any) => ({ disabled: r.resolved }),
          }}
          pagination={{
            current: filters.page as number, pageSize: filters.page_size as number, total: data.total,
            showTotal: t => <Typography.Text type="secondary">共 {t} 条异常记录</Typography.Text>,
            showSizeChanger: true,
            onChange: (p, ps) => updateFilters(f => ({ ...f, page: p, page_size: ps })),
          }}
          locale={{ emptyText: <Empty description="暂无异常记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      {/* Resolve Modal (unresolved → resolve) */}
      <Modal title="处理异常" open={modalOpen}
        onOk={handleResolve} onCancel={() => setModalOpen(false)}
        okText="确认处理" cancelText="取消" width={520}>
        {currentAlert && (
          <div style={{ marginBottom: 20 }}>
            <Card size="small" style={{ background: '#fff7ed', borderRadius: 8, border: '1px solid #ffd591' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">采样点</Typography.Text><br />
                  <Typography.Text strong>{currentAlert.sample_point_name}</Typography.Text>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">报告编号</Typography.Text><br />
                  <Typography.Text code>{currentAlert.record_no}</Typography.Text>
                </Col>
              </Row>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="danger" style={{ fontSize: 16, fontWeight: 600 }}>
                  {currentAlert.indicator_name}: {currentAlert.value_text}
                </Typography.Text>
                <Tag color={SEVERITY_MAP[currentAlert.severity]?.color || 'default'}
                  style={{ marginLeft: 8 }}>{SEVERITY_MAP[currentAlert.severity]?.label || currentAlert.severity}</Tag>
              </div>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{currentAlert.description}</Typography.Text>
            </Card>
          </div>
        )}

        {templates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ marginBottom: 4, display: 'block' }}>快速填入：</Typography.Text>
            <Space wrap size={[4, 4]}>
              {templates.map((t: any) => (
                <Tag key={t.key} style={{ cursor: 'pointer', borderRadius: 6 }}
                  onClick={() => setActionText(prev => prev ? `${prev}；${t.text}` : t.text)}>
                  {t.text}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>整改措施</Typography.Text>
          <Input.TextArea
            placeholder="输入整改措施，或点击上方快速填入"
            rows={3} value={actionText}
            onChange={e => setActionText(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>

      {/* Edit Modal (modify existing corrective action) */}
      <Modal title="编辑整改措施" open={editModalOpen}
        onOk={handleEditAction} onCancel={() => setEditModalOpen(false)}
        okText="保存" cancelText="取消" width={520}>
        {currentAlert && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">
              {currentAlert.sample_point_name} · {currentAlert.indicator_name}: {currentAlert.value_text}
            </Typography.Text>
          </div>
        )}
        <Input.TextArea
          rows={4} value={editText}
          onChange={e => setEditText(e.target.value)}
          style={{ borderRadius: 8 }}
          placeholder="输入整改措施"
        />
      </Modal>

      {/* Detail Modal (view full alert info) */}
      <Modal title="告警详情" open={detailOpen}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        onCancel={() => setDetailOpen(false)} width={560}>
        {currentAlert && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Typography.Text type="secondary">报告编号</Typography.Text><br />
                <Typography.Text code>{currentAlert.record_no}</Typography.Text>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary">检测日期</Typography.Text><br />
                <Typography.Text>{currentAlert.test_date}</Typography.Text>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Typography.Text type="secondary">采样点</Typography.Text><br />
                <Typography.Text strong>{currentAlert.sample_point_name}</Typography.Text>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary">指标</Typography.Text><br />
                <Typography.Text strong style={{ color: '#ff4d4f' }}>
                  {currentAlert.indicator_name}: {currentAlert.value_text}
                </Typography.Text>
              </Col>
            </Row>
            <div>
              <Typography.Text type="secondary">严重程度</Typography.Text><br />
              <Tag color={SEVERITY_MAP[currentAlert.severity]?.color || 'default'}>
                {SEVERITY_MAP[currentAlert.severity]?.label || currentAlert.severity}
              </Tag>
              {currentAlert.verified && <Tag color="processing" style={{ marginLeft: 8 }}>已验证</Tag>}
              <Tag color={currentAlert.resolved ? 'success' : 'error'} style={{ marginLeft: currentAlert.verified ? 4 : 8 }}>
                {currentAlert.resolved ? '已处理' : '待处理'}
              </Tag>
            </div>
            <div>
              <Typography.Text type="secondary">异常描述</Typography.Text>
              <Typography.Text style={{ display: 'block' }}>{currentAlert.description}</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">整改措施</Typography.Text>
              <Typography.Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap', background: '#fafafa', padding: 12, borderRadius: 8 }}>
                {currentAlert.corrective_action || '暂无'}
              </Typography.Paragraph>
            </div>
            {currentAlert.resolved_at && (
              <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">处理人</Typography.Text><br />
                  <Typography.Text>{currentAlert.resolved_by || '—'}</Typography.Text>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">处理时间</Typography.Text><br />
                  <Typography.Text>{dayjs(currentAlert.resolved_at).format('YYYY-MM-DD HH:mm')}</Typography.Text>
                </Col>
              </Row>
            )}
          </Space>
        )}
      </Modal>

      {/* Batch Resolve Modal */}
      <Modal title="批量处理异常" open={batchModalOpen}
        onOk={handleBatchResolve} onCancel={() => setBatchModalOpen(false)}
        okText={`确认批量处理 (${selectedRowKeys.length}条)`} cancelText="取消" width={500}>
        <Typography.Text type="secondary">
          将对选中的 {selectedRowKeys.length} 条待处理告警统一标记为已处理。
        </Typography.Text>
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>统一整改措施（可选）</Typography.Text>
          <Input.TextArea
            placeholder="输入统一的整改措施，将应用到所有选中的告警"
            rows={3} value={batchActionText}
            onChange={e => setBatchActionText(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
}
