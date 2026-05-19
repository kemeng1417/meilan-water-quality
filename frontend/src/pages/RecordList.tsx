import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Card, Button, Select, DatePicker, Space, Tag, Typography, message,
  Popconfirm, Row, Col, Input, Badge, Tooltip, Modal,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, SearchOutlined,
  ClearOutlined, ExportOutlined, CheckOutlined, CloseOutlined,
  ExclamationCircleOutlined, FilterOutlined,
} from '@ant-design/icons';
import {
  getRecords, deleteRecord, batchDeleteRecords, getWaterTypes,
  reviewRecord, rejectRecord, exportExcel,
} from '../api/endpoints';
import { WATER_TYPE_COLORS, STATUS_MAP } from '../theme/tokens';
import dayjs from 'dayjs';

const LS_FILTERS = 'water_records_filters';
const { RangePicker } = DatePicker;

export default function RecordList() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // ── Load saved filters ──
  const savedFilters = (() => {
    try { return JSON.parse(localStorage.getItem(LS_FILTERS) || '{}'); } catch { return {}; }
  })();

  const [data, setData] = useState<any>({ items: [], total: 0, status_counts: {} });
  const [loading, setLoading] = useState(false);
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [filters, setFilters] = useState({
    water_type_id: savedFilters.water_type_id || undefined as number | undefined,
    status: savedFilters.status || undefined as string | undefined,
    keyword: savedFilters.keyword || '',
    start_date: savedFilters.start_date || undefined as string | undefined,
    end_date: savedFilters.end_date || undefined as string | undefined,
    page: 1,
    page_size: 20,
  });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    filters.start_date && filters.end_date ? [dayjs(filters.start_date), dayjs(filters.end_date)] : null
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [reviewModal, setReviewModal] = useState<{ open: boolean; id: number; action: 'approve' | 'reject' }>({
    open: false, id: 0, action: 'approve',
  });
  const [rejectReason, setRejectReason] = useState('');

  // ── Save filters ──
  const saveFilters = (f: typeof filters) => {
    const toSave: Record<string, unknown> = {};
    if (f.water_type_id) toSave.water_type_id = f.water_type_id;
    if (f.status) toSave.status = f.status;
    if (f.keyword) toSave.keyword = f.keyword;
    if (f.start_date) toSave.start_date = f.start_date;
    if (f.end_date) toSave.end_date = f.end_date;
    localStorage.setItem(LS_FILTERS, JSON.stringify(toSave));
  };

  useEffect(() => { getWaterTypes().then(res => setWaterTypes(res.data)); }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, unknown> = { page: filters.page, page_size: filters.page_size };
    if (filters.water_type_id) params.water_type_id = filters.water_type_id;
    if (filters.status) params.status = filters.status;
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    getRecords(params)
      .then(res => { setData(res.data); setSelectedRowKeys([]); })
      .finally(() => setLoading(false));
  }, [filters]);

  const updateFilter = (patch: Partial<typeof filters>) => {
    setFilters(f => {
      const n = { ...f, ...patch, page: 1 };
      saveFilters(n);
      return n;
    });
  };

  // ── Quick date presets ──
  const handleDatePreset = (preset: 'today' | 'week' | 'month' | '30days') => {
    const today = dayjs();
    let start: dayjs.Dayjs;
    switch (preset) {
      case 'today': start = today; break;
      case 'week': start = today.subtract(6, 'day'); break;
      case 'month': start = today.startOf('month'); break;
      case '30days': start = today.subtract(29, 'day'); break;
    }
    setDateRange([start, today]);
    updateFilter({ start_date: start.format('YYYY-MM-DD'), end_date: today.format('YYYY-MM-DD') });
  };

  const handleReset = () => {
    setDateRange(null);
    setFilters({ water_type_id: undefined, status: undefined, keyword: '', start_date: undefined, end_date: undefined, page: 1, page_size: 20 });
    localStorage.removeItem(LS_FILTERS);
  };

  // ── Batch actions ──
  const handleBatchDelete = async () => {
    const eligible = data.items.filter((r: any) =>
      selectedRowKeys.includes(r.id) && r.status !== 'reviewed'
    );
    if (eligible.length === 0) {
      message.warning('所选记录均为已审核状态，不可删除');
      return;
    }
    try {
      await batchDeleteRecords(eligible.map((r: any) => r.id));
      message.success(`已删除 ${eligible.length} 条记录`);
      setSelectedRowKeys([]);
      setFilters(f => ({ ...f, page: 1 }));
    } catch { message.error('批量删除失败'); }
  };

  const handleBatchExport = async () => {
    for (const id of selectedRowKeys as number[]) {
      try {
        const res = await exportExcel(id);
        const blob = new Blob([res.data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `report_${id}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      } catch { /* skip */ }
    }
    message.success(`已导出 ${selectedRowKeys.length} 条记录`);
  };

  // ── Quick review ──
  const handleQuickReview = async () => {
    try {
      await reviewRecord(reviewModal.id, user.display_name || '审核人');
      message.success('审核通过');
      setReviewModal({ open: false, id: 0, action: 'approve' });
      setFilters(f => ({ ...f, page: f.page }));
    } catch { message.error('审核失败'); }
  };

  const handleQuickReject = async () => {
    if (!rejectReason.trim()) { message.warning('请输入打回原因'); return; }
    try {
      await rejectRecord(reviewModal.id, user.display_name || '审核人', rejectReason);
      message.success('已打回');
      setReviewModal({ open: false, id: 0, action: 'reject' });
      setRejectReason('');
      setFilters(f => ({ ...f, page: f.page }));
    } catch { message.error('操作失败'); }
  };

  // ── Expand row ──
  const expandedRowRender = (record: any) => (
      <Row gutter={16} style={{ padding: '8px 0' }}>
        <Col span={6}>
          <Typography.Text type="secondary">报告编号</Typography.Text>
          <br />
          <Typography.Text code>{record.record_no}</Typography.Text>
        </Col>
        <Col span={4}>
          <Typography.Text type="secondary">创建时间</Typography.Text>
          <br />
          <Typography.Text>{record.created_at ? dayjs(record.created_at).format('YYYY-MM-DD HH:mm') : '—'}</Typography.Text>
        </Col>
        <Col span={4}>
          <Typography.Text type="secondary">更新时间</Typography.Text>
          <br />
          <Typography.Text>{record.updated_at ? dayjs(record.updated_at).format('YYYY-MM-DD HH:mm') : '—'}</Typography.Text>
        </Col>
        <Col span={4}>
          <Typography.Text type="secondary">结论</Typography.Text>
          <br />
          <Typography.Text ellipsis={{ tooltip: record.conclusion }} style={{ maxWidth: 200 }}>
            {record.conclusion || '—'}
          </Typography.Text>
        </Col>
        <Col span={6}>
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/records/${record.id}`)}>查看详情</Button>
            <Button size="small" icon={<ExportOutlined />} onClick={async () => {
              const res = await exportExcel(record.id);
              const blob = new Blob([res.data]);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url;
              a.download = `${record.record_no}.xlsx`; a.click();
              URL.revokeObjectURL(url);
            }}>导出</Button>
          </Space>
        </Col>
      </Row>
  );

  // ── Columns ──
  const columns: any[] = [
    {
      title: '报告编号', dataIndex: 'record_no', width: 180, sorter: true,
      render: (v: string, r: any) => (
        <Typography.Text
          code
          style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); navigate(`/records/${r.id}`); }}
        >
          {v}
        </Typography.Text>
      ),
    },
    {
      title: '水样类型', dataIndex: 'water_type_id', width: 110,
      render: (v: number) => {
        const wt = waterTypes.find(w => w.id === v);
        return <Tag color={WATER_TYPE_COLORS[wt?.code || ''] || 'default'} style={{ borderRadius: 6 }}>{wt?.name || v}</Tag>;
      },
    },
    { title: '化验日期', dataIndex: 'test_date', width: 110, sorter: true },
    { title: '报告日期', dataIndex: 'report_date', width: 110 },
    { title: '化验员', dataIndex: 'tester', width: 80 },
    {
      title: '审核人', dataIndex: 'reviewer', width: 80,
      render: (v: string | null) => v || <span style={{ color: '#cbd5e1' }}>—</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 85,
      render: (s: string) => {
        const st = STATUS_MAP[s] || { label: s, color: 'default' };
        return <Tag color={st.color} style={{ borderRadius: 6 }}>{st.label}</Tag>;
      },
    },
    {
      title: '异常', width: 70, align: 'center' as const, sorter: true,
      render: (_: any, r: any) => r.is_abnormal
        ? <Badge count="!" size="small" style={{ backgroundColor: '#ff4d4f' }} />
        : <span style={{ color: '#52c41a', fontSize: 12 }}>✓</span>,
    },
    {
      title: '结论', dataIndex: 'conclusion', width: 180, ellipsis: true,
      render: (v: string | null, r: any) => {
        if (v) return <Tooltip title={v}><Typography.Text ellipsis style={{ maxWidth: 160 }}>{v}</Typography.Text></Tooltip>;
        if (r.is_abnormal) return <Typography.Text type="danger" style={{ fontSize: 12 }}>存在异常</Typography.Text>;
        return <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>;
      },
    },
    {
      title: '操作', width: 200, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />}
            onClick={e => { e.stopPropagation(); navigate(`/records/${r.id}`); }}>查看</Button>
          {(r.status === 'submitted' || r.status === 'rejected') && (
            <>
              <Button type="link" size="small" style={{ color: '#52c41a' }} icon={<CheckOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  setReviewModal({ open: true, id: r.id, action: 'approve' });
                }}>审核</Button>
              <Button type="link" size="small" danger icon={<CloseOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  setReviewModal({ open: true, id: r.id, action: 'reject' });
                }}>打回</Button>
            </>
          )}
          {r.status === 'draft' && (
            <Popconfirm title="确定删除此报告？" onConfirm={() => {
              deleteRecord(r.id).then(() => { message.success('已删除'); setFilters(f => ({ ...f, page: 1 })); });
            }} okText="删除" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}
                onClick={e => e.stopPropagation()}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Status stats ──
  const counts = data.status_counts || {};
  const statusTabs = [
    { key: '', label: '全部', count: data.total },
    { key: 'draft', label: '草稿', count: counts.draft || 0, color: '#64748b' },
    { key: 'submitted', label: '待审核', count: counts.submitted || 0, color: '#0891b2' },
    { key: 'reviewed', label: '已审核', count: counts.reviewed || 0, color: '#52c41a' },
    { key: 'rejected', label: '已打回', count: counts.rejected || 0, color: '#faad14' },
  ];

  // ── Row class ──
  const rowClassName = (record: any) => {
    if (record.status === 'rejected') return 'row-rejected';
    return '';
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>检测记录</Typography.Title>
          <Typography.Text type="secondary">管理和查询所有水质检测报告</Typography.Text>
        </div>
        <Space>
          <Button
            type="primary" size="large" icon={<PlusOutlined />}
            onClick={() => navigate('/records/entry')}
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none' }}
          >
            新建报告
          </Button>
        </Space>
      </div>

      {/* ── Status Stats Bar ── */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 10 }} bodyStyle={{ padding: '8px 16px' }}>
        <Space size="large" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={0} style={{ gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <FilterOutlined style={{ color: '#94a3b8', marginRight: 4 }} />
              {statusTabs.map(s => (
                <Button
                  key={s.key}
                  type={filters.status === s.key || (!filters.status && s.key === '') ? 'primary' : 'text'}
                  size="small"
                  ghost={filters.status === s.key || (!filters.status && s.key === '')}
                  style={{
                    borderRadius: 16,
                    fontWeight: filters.status === s.key || (!filters.status && s.key === '') ? 600 : 400,
                    padding: '0 10px',
                    minWidth: s.key ? undefined : 40,
                  }}
                  onClick={() => updateFilter({ status: s.key || undefined })}
                >
                  {s.label} <span style={{
                    marginLeft: 2, fontSize: 11, opacity: 0.8,
                    background: filters.status === s.key || (!filters.status && s.key === '') ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                    padding: '0 6px', borderRadius: 10,
                  }}>{s.count}</span>
                </Button>
              ))}
            </div>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            共 {data.total} 条记录
          </Typography.Text>
        </Space>
      </Card>

      {/* ── Filter Bar ── */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="搜索报告编号 / 化验员"
              allowClear
              style={{ width: 220, borderRadius: 8 }}
              value={filters.keyword}
              onChange={e => updateFilter({ keyword: e.target.value })}
            />
          </Col>
          <Col>
            <Select
              placeholder="水样类型" allowClear style={{ width: 140 }}
              value={filters.water_type_id}
              onChange={v => updateFilter({ water_type_id: v })}
              options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
            />
          </Col>
          <Col>
            <Space size={4}>
              <Button size="small" type={dateRange && dayjs(dateRange[0]).isSame(dayjs(), 'day') && dayjs(dateRange[1]).isSame(dayjs(), 'day') ? 'primary' : 'default'}
                onClick={() => handleDatePreset('today')}>今天</Button>
              <Button size="small" type="default" onClick={() => handleDatePreset('week')}>近7天</Button>
              <Button size="small" type="default" onClick={() => handleDatePreset('month')}>本月</Button>
              <Button size="small" type="default" onClick={() => handleDatePreset('30days')}>近30天</Button>
            </Space>
          </Col>
          <Col>
            <RangePicker
              size="small"
              value={dateRange as any}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);
                if (dates?.[0] && dates?.[1]) {
                  setFilters(f => {
                    const n = { ...f, start_date: dates[0]!.format('YYYY-MM-DD'), end_date: dates[1]!.format('YYYY-MM-DD'), page: 1 };
                    saveFilters(n);
                    return n;
                  });
                } else {
                  setFilters(f => {
                    const n = { ...f, start_date: undefined, end_date: undefined, page: 1 };
                    saveFilters(n);
                    return n;
                  });
                }
              }}
              placeholder={['开始日期', '结束日期']}
              style={{ borderRadius: 8 }}
              allowClear
            />
          </Col>
          <Col flex="1" style={{ textAlign: 'right' }}>
            <Button icon={<ClearOutlined />} onClick={handleReset} size="small" style={{ borderRadius: 8 }}>
              重置
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── Batch actions ── */}
      {selectedRowKeys.length > 0 && (
        <Card size="small" style={{ marginBottom: 12, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}
          bodyStyle={{ padding: '8px 16px' }}>
          <Space>
            <Typography.Text strong>已选 {selectedRowKeys.length} 条</Typography.Text>
            <Button size="small" icon={<ExportOutlined />} onClick={handleBatchExport}>批量导出</Button>
            <Popconfirm title={`确定删除已选的 ${selectedRowKeys.length} 条记录？`} onConfirm={handleBatchDelete}>
              <Button size="small" danger icon={<DeleteOutlined />}>批量删除</Button>
            </Popconfirm>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        </Card>
      )}

      {/* ── Table ── */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          columns={columns}
          dataSource={data.items}
          rowKey="id"
          loading={loading}
          size="middle"
          scroll={{ x: 1300 }}
          rowClassName={rowClassName}
          onRow={r => ({
            onClick: () => navigate(`/records/${r.id}`),
            style: { cursor: 'pointer' },
          })}
          expandable={{
            expandedRowRender,
            expandIcon: ({ expanded, onExpand, record }) => (
              <Button
                type="text" size="small"
                style={{ color: '#94a3b8', fontSize: 10 }}
                onClick={e => { e.stopPropagation(); onExpand(record, e); }}
              >
                {expanded ? '▼' : '▶'}
              </Button>
            ),
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            getCheckboxProps: (_r: any) => ({}),
            selections: [
              Table.SELECTION_ALL,
              Table.SELECTION_INVERT,
            ],
          }}
          pagination={{
            current: filters.page,
            pageSize: filters.page_size,
            total: data.total,
            showTotal: t => <Typography.Text type="secondary">共 {t} 条记录</Typography.Text>,
            onChange: (p, ps) => setFilters(f => ({ ...f, page: p, page_size: ps })),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
          locale={{
            emptyText: (
              <div style={{ padding: 40 }}>
                <ExclamationCircleOutlined style={{ fontSize: 40, color: '#cbd5e1', marginBottom: 12 }} />
                <br />
                <Typography.Text type="secondary">暂无匹配的检测记录</Typography.Text>
                <br />
                <Button type="link" onClick={handleReset}>清除筛选条件</Button>
              </div>
            ),
          }}
        />
      </Card>

      {/* ── Review modal ── */}
      <Modal
        title={reviewModal.action === 'approve' ? '审核通过' : '打回报告'}
        open={reviewModal.open}
        onOk={reviewModal.action === 'approve' ? handleQuickReview : handleQuickReject}
        onCancel={() => setReviewModal({ open: false, id: 0, action: 'approve' })}
        okText={reviewModal.action === 'approve' ? '确认通过' : '确认打回'}
        cancelText="取消"
        okButtonProps={{ danger: reviewModal.action === 'reject' }}
      >
        {reviewModal.action === 'reject' && (
          <Input.TextArea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="请输入打回原因（必填）"
            rows={3}
            style={{ marginTop: 8 }}
          />
        )}
        {reviewModal.action === 'approve' && (
          <Typography.Text>确认审核通过此报告？</Typography.Text>
        )}
      </Modal>

      {/* ── CSS for rejected rows ── */}
      <style>{`
        .row-rejected td { background: #fffbe6 !important; }
        .row-rejected:hover td { background: #fff7cc !important; }
      `}</style>
    </div>
  );
}
