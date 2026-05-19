import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Select, DatePicker, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { getRecords, deleteRecord, getWaterTypes } from '../api/endpoints';
import { WATER_TYPE_COLORS, STATUS_MAP } from '../theme/tokens';

export default function RecordList() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [filters, setFilters] = useState({
    water_type_id: undefined as number | undefined,
    status: undefined as string | undefined,
    start_date: undefined as string | undefined,
    end_date: undefined as string | undefined,
    page: 1, page_size: 20,
  });

  useEffect(() => { getWaterTypes().then(res => setWaterTypes(res.data)); }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, unknown> = { page: filters.page, page_size: filters.page_size };
    if (filters.water_type_id) params.water_type_id = filters.water_type_id;
    if (filters.status) params.status = filters.status;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    getRecords(params).then(res => setData(res.data)).finally(() => setLoading(false));
  }, [filters]);

  const handleDelete = async (id: number) => {
    try { await deleteRecord(id); message.success('已删除'); setFilters(f => ({ ...f, page: 1 })); }
    catch { message.error('删除失败'); }
  };


  const columns = [
    { title: '报告编号', dataIndex: 'record_no', width: 175, render: (v: string) => <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text> },
    {
      title: '水样类型', dataIndex: 'water_type_id', width: 100,
      render: (v: number) => {
        const wt = waterTypes.find(w => w.id === v);
        return <Tag color={WATER_TYPE_COLORS[wt?.code || ''] || 'default'} style={{ borderRadius: 6 }}>{wt?.name || v}</Tag>;
      },
    },
    { title: '化验日期', dataIndex: 'test_date', width: 110 },
    { title: '化验员', dataIndex: 'tester', width: 90 },
    { title: '审核人', dataIndex: 'reviewer', width: 90, render: (v: string | null) => v || <span style={{ color: '#cbd5e1' }}>—</span> },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (s: string) => {
        const st = STATUS_MAP[s];
        return <Tag color={st?.color} style={{ borderRadius: 6 }}>{st?.label || s}</Tag>;
      },
    },
    {
      title: '异常', width: 70, align: 'center' as const,
      render: (_: any, r: any) => r.is_abnormal
        ? <Tag color="error" style={{ borderRadius: 10 }}>异常</Tag>
        : <span style={{ color: '#52c41a', fontSize: 12 }}>✓</span>,
    },
    {
      title: '操作', width: 160,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/records/new?id=${r.id}`)}>查看</Button>
          {r.status === 'draft' && (
            <Popconfirm title="确定删除此报告？" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>检测记录</Typography.Title>
          <Typography.Text type="secondary">管理和查询所有水质检测报告</Typography.Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/records/new')}
          style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none' }}>
          新建报告
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '12px 20px' }}>
        <Space wrap size="middle">
          <Select placeholder="水样类型" allowClear style={{ width: 140 }} value={filters.water_type_id}
            onChange={v => setFilters(f => ({ ...f, water_type_id: v, page: 1 }))}
            options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
          />
          <Select placeholder="状态" allowClear style={{ width: 120 }} value={filters.status}
            onChange={v => setFilters(f => ({ ...f, status: v, page: 1 }))}
            options={[
              { label: '草稿', value: 'draft' }, { label: '待审核', value: 'submitted' }, { label: '已审核', value: 'reviewed' },
            ]}
          />
          <DatePicker placeholder="开始日期" onChange={d => setFilters(f => ({ ...f, start_date: d?.format('YYYY-MM-DD'), page: 1 }))} style={{ borderRadius: 8 }} />
          <DatePicker placeholder="结束日期" onChange={d => setFilters(f => ({ ...f, end_date: d?.format('YYYY-MM-DD'), page: 1 }))} style={{ borderRadius: 8 }} />
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          columns={columns} dataSource={data.items} rowKey="id" loading={loading} size="middle"
          scroll={{ x: 1050 }}
          pagination={{
            current: filters.page, pageSize: filters.page_size, total: data.total,
            showTotal: t => <Typography.Text type="secondary">共 {t} 条记录</Typography.Text>,
            onChange: (p, ps) => setFilters(f => ({ ...f, page: p, page_size: ps })),
            showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
          }}
        />
      </Card>
    </div>
  );
}
