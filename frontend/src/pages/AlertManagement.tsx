import { useState, useEffect } from 'react';
import { Table, Card, Select, Tag, Button, Space, Typography, Modal, Input, message, Empty } from 'antd';
import { CheckOutlined, WarningOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { getAlerts, updateAlert } from '../api/endpoints';
import dayjs from 'dayjs';

export default function AlertManagement() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: undefined as string | undefined, page: 1, page_size: 20 });
  const [modalOpen, setModalOpen] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<any>(null);
  const [actionText, setActionText] = useState('');

  useEffect(() => {
    setLoading(true);
    getAlerts({ ...filters }).then(res => setData(res.data)).finally(() => setLoading(false));
  }, [filters]);

  const handleResolve = async (id: number) => {
    try {
      await updateAlert(id, { corrective_action: actionText, resolved: true });
      message.success('已标记为已处理');
      setModalOpen(false); setActionText('');
      setFilters(f => ({ ...f, page: 1 }));
    } catch { message.error('操作失败'); }
  };

  const columns = [
    { title: '报告编号', dataIndex: 'record_no', width: 165, render: (v: string) => <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text> },
    { title: '日期', dataIndex: 'test_date', width: 105 },
    {
      title: '采样点', dataIndex: 'sample_point_name', width: 170, ellipsis: true,
      render: (v: string) => <span><EnvironmentOutlined style={{ color: '#94a3b8', marginRight: 6 }} />{v}</span>,
    },
    { title: '指标', dataIndex: 'indicator_name', width: 100 },
    {
      title: '检测值', dataIndex: 'value_text', width: 80,
      render: (v: string) => <Typography.Text strong style={{ color: '#ff4d4f', fontSize: 14 }}>{v}</Typography.Text>,
    },
    { title: '异常描述', dataIndex: 'description', ellipsis: true, width: 240 },
    {
      title: '状态', dataIndex: 'resolved', width: 90,
      render: (v: boolean) => v
        ? <Tag color="success" style={{ borderRadius: 6 }}>✓ 已处理</Tag>
        : <Tag color="error" style={{ borderRadius: 6 }}><WarningOutlined /> 待处理</Tag>,
    },
    {
      title: '整改措施', dataIndex: 'corrective_action', width: 200, ellipsis: true,
      render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '操作', width: 100,
      render: (_: any, r: any) => !r.resolved ? (
        <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => { setCurrentAlert(r); setModalOpen(true); }}
          style={{ borderRadius: 6 }}>处理</Button>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {r.resolved_at ? dayjs(r.resolved_at).format('MM-DD') : ''}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>异常管理</Typography.Title>
        <Typography.Text type="secondary">跟踪和处理水质检测中的超标项目</Typography.Text>
      </div>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '12px 20px' }}>
        <Space>
          <Select placeholder="筛选状态" allowClear style={{ width: 130 }} value={filters.status}
            onChange={v => setFilters(f => ({ ...f, status: v, page: 1 }))}
            options={[{ label: '待处理', value: 'open' }, { label: '已处理', value: 'resolved' }]}
          />
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table columns={columns} dataSource={data.items} rowKey="id" loading={loading} size="middle" scroll={{ x: 1200 }}
          pagination={{
            current: filters.page, pageSize: filters.page_size, total: data.total,
            showTotal: t => <Typography.Text type="secondary">共 {t} 条异常记录</Typography.Text>,
            onChange: (p, ps) => setFilters(f => ({ ...f, page: p, page_size: ps })),
          }}
          locale={{ emptyText: <Empty description="暂无异常记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      <Modal title="处理异常" open={modalOpen} onOk={() => handleResolve(currentAlert?.id)} onCancel={() => setModalOpen(false)}
        okText="确认处理" cancelText="取消">
        {currentAlert && (
          <div style={{ marginBottom: 20 }}>
            <Card size="small" style={{ background: '#fff7ed', borderRadius: 8, border: '1px solid #ffd591' }}>
              <Typography.Text strong>{currentAlert.sample_point_name}</Typography.Text>
              <br />
              <Typography.Text type="danger" style={{ fontSize: 16, fontWeight: 600 }}>
                {currentAlert.indicator_name}: {currentAlert.value_text}
              </Typography.Text>
              <br />
              <Typography.Text type="secondary">{currentAlert.description}</Typography.Text>
            </Card>
          </div>
        )}
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>整改措施</Typography.Text>
          <Input.TextArea
            placeholder="输入整改措施，如：更换滤芯、停用设备待检修、加强消毒剂投加等"
            rows={3}
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
}
