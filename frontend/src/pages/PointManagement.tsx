import { useState, useEffect } from 'react';
import { Table, Card, Tag, Typography, Select, Space, Button, Modal, Input, Form, message, Popconfirm, Switch, Radio } from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons';
import { getWaterTypes } from '../api/endpoints';
import { WATER_TYPE_COLORS } from '../theme/tokens';
import client from '../api/client';

export default function PointManagement() {
  const [points, setPoints] = useState<any[]>([]);
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [selectedWt, setSelectedWt] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<any>(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => { getWaterTypes().then(res => setWaterTypes(res.data)); }, []);

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
    } catch { message.error('操作失败'); }
    finally { setLoading(false); }
  };

  const handleToggleActive = async (pt: any) => {
    try {
      await client.put(`/sample-points/${pt.id}`, {
        water_type_id: pt.water_type_id,
        code: pt.code,
        name: pt.name,
        area: pt.area || '',
        floor: pt.floor || '',
        sort_order: pt.sort_order,
        is_active: !pt.is_active,
      });
      message.success(pt.is_active ? '已停用' : '已启用');
      loadPoints();
    } catch { message.error('操作失败'); }
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

  const columns = [
    { title: '编号', dataIndex: 'code', width: 120, render: (v: string) => <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text> },
    {
      title: '名称', dataIndex: 'name', width: 240, ellipsis: true,
      render: (v: string) => <span><EnvironmentOutlined style={{ color: '#94a3b8', marginRight: 6 }} />{v}</span>,
    },
    {
      title: '水样类型', dataIndex: 'water_type_id', width: 110,
      render: (v: number) => {
        const wt = waterTypes.find(w => w.id === v);
        return <Tag color={WATER_TYPE_COLORS[wt?.code || ''] || 'default'} style={{ borderRadius: 6 }}>{wt?.name || v}</Tag>;
      },
    },
    { title: '区域', dataIndex: 'area', width: 120 },
    { title: '楼层', dataIndex: 'floor', width: 80, render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: '状态', dataIndex: 'is_active', width: 90, align: 'center' as const,
      render: (v: boolean) => v
        ? <Tag color="success" style={{ borderRadius: 6 }}>启用</Tag>
        : <Tag color="default" style={{ borderRadius: 6 }}>已停用</Tag>,
    },
    {
      title: '操作', width: 180,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title={r.is_active ? '确定停用？停用后不会出现在新建报告中' : '确定重新启用？'}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>采样点管理</Typography.Title>
          <Typography.Text type="secondary">管理采样点，停用的点位不会出现在新建报告中</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ borderRadius: 8 }}>添加点位</Button>
      </div>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '12px 20px' }}>
        <Space size="middle" wrap>
          <span style={{ color: '#64748b' }}>水样类型：</span>
          <Select placeholder="全部类型" allowClear style={{ width: 180 }} value={selectedWt} onChange={setSelectedWt}
            options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
          />
          <span style={{ color: '#64748b' }}>状态：</span>
          <Radio.Group value={activeFilter} onChange={e => setActiveFilter(e.target.value)} size="small" optionType="button" buttonStyle="solid">
            <Radio.Button value="active">启用</Radio.Button>
            <Radio.Button value="inactive">已停用</Radio.Button>
            <Radio.Button value="all">全部</Radio.Button>
          </Radio.Group>
          <Button icon={<ReloadOutlined />} onClick={loadPoints} size="small">刷新</Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table columns={columns} dataSource={points} rowKey="id" size="middle"
          pagination={{ pageSize: 50, showTotal: t => <Typography.Text type="secondary">共 {t} 个采样点</Typography.Text> }}
        />
      </Card>

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
          <Form.Item name="water_type_id" label="水样类型" rules={[{ required: true }]}>
            <Select options={waterTypes.map(w => ({ label: w.name, value: w.id }))} />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="如 ZYS-001" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 27#0016直饮水机" />
          </Form.Item>
          <Form.Item name="area" label="区域">
            <Input placeholder="如 一期航站楼" />
          </Form.Item>
          <Form.Item name="floor" label="楼层">
            <Input placeholder="如 3F" />
          </Form.Item>
          <Space>
            <Form.Item name="sort_order" label="排序">
              <Input type="number" style={{ width: 80 }} />
            </Form.Item>
            <Form.Item name="is_active" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
