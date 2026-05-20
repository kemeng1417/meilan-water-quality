import { useState, useEffect, useMemo } from 'react';
import {
  Table, Card, Tag, Typography, Select, Space, Button, Modal, Input, Form,
  message, Popconfirm, Switch, Radio, Row, Col, Statistic, AutoComplete, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined,
  EnvironmentOutlined, ReloadOutlined, SearchOutlined, ClearOutlined,
} from '@ant-design/icons';
import { getWaterTypes, getSamplePointUsageStats, batchUpdateSamplePoints } from '../api/endpoints';
import { WATER_TYPE_COLORS, AREA_COLORS } from '../theme/tokens';
import client from '../api/client';

export default function PointManagement() {
  const [points, setPoints] = useState<any[]>([]);
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [usageStats, setUsageStats] = useState<Record<number, { record_count: number; last_test_date: string | null }>>({});
  const [selectedWt, setSelectedWt] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<any>(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchAreaModal, setBatchAreaModal] = useState(false);
  const [batchArea, setBatchArea] = useState('');

  useEffect(() => {
    getWaterTypes().then(res => setWaterTypes(res.data));
    getSamplePointUsageStats().then(res => {
      const map: Record<number, any> = {};
      res.data.forEach((s: any) => { map[s.sample_point_id] = s; });
      setUsageStats(map);
    });
  }, []);

  const loadPoints = () => {
    const activeOnly = activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined;
    client.get('/sample-points', {
      params: { water_type_id: selectedWt || undefined, active_only: activeOnly },
    }).then(res => setPoints(res.data));
  };

  useEffect(() => { loadPoints(); }, [selectedWt, activeFilter]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (editingPoint) {
        await client.put(`/sample-points/${editingPoint.id}`, values);
        message.success('已更新');
      } else {
        await client.post('/sample-points', values);
        message.success('已添加');
      }
      setModalOpen(false);
      loadPoints();
      getSamplePointUsageStats().then(res => {
        const map: Record<number, any> = {};
        res.data.forEach((s: any) => { map[s.sample_point_id] = s; });
        setUsageStats(map);
      });
    } catch { message.error('操作失败'); }
    finally { setLoading(false); }
  };

  const handleToggleActive = async (pt: any) => {
    try {
      const usage = usageStats[pt.id];
      if (pt.is_active && usage?.record_count > 0) {
        // Confirm with usage info
      }
      await client.put(`/sample-points/${pt.id}`, {
        water_type_id: pt.water_type_id,
        code: pt.code,
        name: pt.name,
        area: pt.area || '',
        location: pt.location || '',
        floor: pt.floor || '',
        sort_order: pt.sort_order,
        is_active: !pt.is_active,
      });
      message.success(pt.is_active ? '已停用' : '已启用');
      loadPoints();
    } catch { message.error('操作失败'); }
  };

  // ── Batch operations ──
  const handleBatchToggle = async (isActive: boolean) => {
    try {
      await batchUpdateSamplePoints(selectedRowKeys as number[], { is_active: isActive });
      message.success(`已${isActive ? '启用' : '停用'} ${selectedRowKeys.length} 个点位`);
      setSelectedRowKeys([]);
      loadPoints();
    } catch { message.error('批量操作失败'); }
  };

  const handleBatchChangeArea = async () => {
    if (!batchArea) return;
    try {
      await batchUpdateSamplePoints(selectedRowKeys as number[], { area: batchArea });
      message.success(`已修改 ${selectedRowKeys.length} 个点位的区域为「${batchArea}」`);
      setSelectedRowKeys([]);
      setBatchAreaModal(false);
      setBatchArea('');
      loadPoints();
    } catch { message.error('批量操作失败'); }
  };

  const openAdd = () => {
    setEditingPoint(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, sort_order: 0 });
    setModalOpen(true);
  };

  const openEdit = (pt: any) => {
    setEditingPoint(pt);
    form.setFieldsValue(pt);
    setModalOpen(true);
  };

  // ── Existing values for autocomplete ──
  const existingAreas = useMemo(() => [...new Set(points.map(p => p.area).filter(Boolean))] as string[], [points]);
  const existingFloors = useMemo(() => [...new Set(points.map(p => p.floor).filter(Boolean))] as string[], [points]);

  // ── Filtered & searched data ──
  const filteredPoints = useMemo(() => {
    if (!searchText) return points;
    const s = searchText.toLowerCase();
    return points.filter(p =>
      p.name?.toLowerCase().includes(s) ||
      p.code?.toLowerCase().includes(s) ||
      p.area?.toLowerCase().includes(s)
    );
  }, [points, searchText]);

  // ── Stats ──
  const activeCount = points.filter(p => p.is_active).length;
  const inactiveCount = points.filter(p => !p.is_active).length;

  const columns = [
    {
      title: '编码', dataIndex: 'code', width: 110, sorter: (a: any, b: any) => (a.code || '').localeCompare(b.code || ''),
      render: (v: string) => <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    {
      title: '名称', dataIndex: 'name', width: 220, ellipsis: true, sorter: (a: any, b: any) => (a.name || '').localeCompare(b.name || ''),
      render: (v: string) => <span><EnvironmentOutlined style={{ color: '#94a3b8', marginRight: 6 }} />{v}</span>,
    },
    {
      title: '水样类型', dataIndex: 'water_type_id', width: 100, sorter: (a: any, b: any) => a.water_type_id - b.water_type_id,
      render: (v: number) => {
        const wt = waterTypes.find(w => w.id === v);
        return <Tag color={WATER_TYPE_COLORS[wt?.code || ''] || 'default'} style={{ borderRadius: 6 }}>{wt?.name || v}</Tag>;
      },
    },
    {
      title: '区域', dataIndex: 'area', width: 110, sorter: (a: any, b: any) => (a.area || '').localeCompare(b.area || ''),
      render: (v: string) => v
        ? <Tag color={AREA_COLORS[v] || 'geekblue'} style={{ borderRadius: 6, margin: 0 }}>{v}</Tag>
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '楼层', dataIndex: 'floor', width: 70,
      render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '排序', dataIndex: 'sort_order', width: 65, align: 'center' as const,
      sorter: (a: any, b: any) => a.sort_order - b.sort_order,
    },
    {
      title: '检测次数', width: 85, align: 'center' as const,
      render: (_: any, r: any) => {
        const stats = usageStats[r.id];
        if (!stats || stats.record_count === 0) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Tooltip title={`最近检测: ${stats.last_test_date || '—'}`}>
            <Typography.Text style={{ color: '#0891b2', cursor: 'default' }}>{stats.record_count}</Typography.Text>
          </Tooltip>
        );
      },
    },
    {
      title: '状态', dataIndex: 'is_active', width: 80, align: 'center' as const,
      sorter: (a: any, b: any) => (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0),
      render: (v: boolean) => v
        ? <Tag color="success" style={{ borderRadius: 6 }}>启用</Tag>
        : <Tag color="default" style={{ borderRadius: 6 }}>已停用</Tag>,
    },
    {
      title: '操作', width: 180, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title={
              r.is_active
                ? (usageStats[r.id]?.record_count > 0
                  ? `确定停用？该点位关联了 ${usageStats[r.id].record_count} 条检测记录`
                  : '确定停用？停用后不会出现在新建报告中')
                : '确定重新启用？'
            }
            onConfirm={() => handleToggleActive(r)}
            okText="确定" cancelText="取消"
          >
            <Button
              type="link" size="small"
              danger={r.is_active}
              icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
            >
              {r.is_active ? '停用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>采样点管理</Typography.Title>
          <Typography.Text type="secondary">管理采样点，停用的点位不会出现在新建报告中</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ borderRadius: 8 }}>添加点位</Button>
      </div>

      {/* ── Stats Row ── */}
      <Row gutter={12} style={{ marginBottom: 14 }}>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="总点位" value={points.length} suffix="个" valueStyle={{ fontSize: 22, color: '#0891b2' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="已启用" value={activeCount} suffix="个" valueStyle={{ fontSize: 22, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="已停用" value={inactiveCount} suffix="个" valueStyle={{ fontSize: 22, color: '#94a3b8' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="有水样类型" value={[...new Set(points.map(p => p.water_type_id))].length} suffix="种" valueStyle={{ fontSize: 22, color: '#0e7490' }} />
          </Card>
        </Col>
      </Row>

      {/* ── Filter Bar ── */}
      <Card size="small" style={{ marginBottom: 14, borderRadius: 10 }} bodyStyle={{ padding: '10px 16px' }}>
        <Space size="middle" wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size="middle" wrap>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="搜索名称/编码/区域"
              allowClear
              style={{ width: 220, borderRadius: 8 }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <Select placeholder="水样类型" allowClear style={{ width: 160 }} value={selectedWt} onChange={setSelectedWt}
              options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
            />
            <Radio.Group value={activeFilter} onChange={e => setActiveFilter(e.target.value)} size="small" optionType="button" buttonStyle="solid">
              <Radio.Button value="all">全部</Radio.Button>
              <Radio.Button value="active">启用</Radio.Button>
              <Radio.Button value="inactive">已停用</Radio.Button>
            </Radio.Group>
          </Space>
          <Space>
            {searchText || selectedWt || activeFilter !== 'all' ? (
              <Button icon={<ClearOutlined />} size="small" onClick={() => { setSearchText(''); setSelectedWt(undefined); setActiveFilter('all'); }}>
                重置
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={loadPoints} size="small">刷新</Button>
          </Space>
        </Space>
      </Card>

      {/* ── Batch Actions ── */}
      {selectedRowKeys.length > 0 && (
        <Card size="small" style={{ marginBottom: 14, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}
          bodyStyle={{ padding: '8px 16px' }}>
          <Space size="middle">
            <Typography.Text strong>已选 {selectedRowKeys.length} 个点位</Typography.Text>
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleBatchToggle(true)}>批量启用</Button>
            <Button size="small" icon={<StopOutlined />} onClick={() => handleBatchToggle(false)}>批量停用</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => setBatchAreaModal(true)}>批量修改区域</Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        </Card>
      )}

      {/* ── Table ── */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          columns={columns}
          dataSource={filteredPoints}
          rowKey="id"
          size="middle"
          scroll={{ x: 1080 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT],
          }}
          pagination={{
            pageSize: 50,
            showTotal: t => <Typography.Text type="secondary">共 {t} 个采样点</Typography.Text>,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
          }}
        />
      </Card>

      {/* ── Add/Edit Modal ── */}
      <Modal
        title={editingPoint ? '编辑采样点' : '添加采样点'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="water_type_id" label="水样类型" rules={[{ required: true, message: '请选择水样类型' }]}>
            <Select options={waterTypes.map(w => ({ label: w.name, value: w.id }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
                <Input placeholder="如 ZYS-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="如 27#0016直饮水机" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="area" label="区域" rules={[{ required: true, message: '请选择或输入区域' }]}>
            <AutoComplete
              placeholder="选择或输入区域"
              options={existingAreas.map(a => ({ value: a }))}
              filterOption
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="floor" label="楼层">
                <AutoComplete
                  placeholder="选择或输入楼层"
                  options={existingFloors.map(f => ({ value: f }))}
                  filterOption
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="位置">
                <Input placeholder="如 航站楼值机区" />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Form.Item name="sort_order" label="排序号">
              <Input type="number" style={{ width: 80 }} />
            </Form.Item>
            <Form.Item name="is_active" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* ── Batch Area Modal ── */}
      <Modal
        title="批量修改区域"
        open={batchAreaModal}
        onOk={handleBatchChangeArea}
        onCancel={() => { setBatchAreaModal(false); setBatchArea(''); }}
        okText="确认修改"
        cancelText="取消"
      >
        <Typography.Text>为已选的 {selectedRowKeys.length} 个点位设置新区域：</Typography.Text>
        <AutoComplete
          style={{ marginTop: 12, width: '100%' }}
          placeholder="输入区域名称"
          value={batchArea}
          onChange={setBatchArea}
          options={existingAreas.map(a => ({ value: a }))}
        />
      </Modal>
    </div>
  );
}
