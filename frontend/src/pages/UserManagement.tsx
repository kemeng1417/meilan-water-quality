import { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Typography, Space, Modal, Input, Form, Select, message, Popconfirm, Switch } from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser } from '../api/endpoints';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();

  const loadUsers = () => {
    setLoading(true);
    getUsers().then(res => setUsers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingUser) {
        await updateUser(editingUser.id, values);
        message.success('已更新');
      } else {
        await createUser(values);
        message.success('已添加');
      }
      setModalOpen(false);
      loadUsers();
    } catch { message.error('操作失败'); }
  };

  const handleToggleActive = async (u: any) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      message.success(u.is_active ? '已停用' : '已启用');
      loadUsers();
    } catch { message.error('操作失败'); }
  };

  const openAdd = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'tester', is_active: true });
    setModalOpen(true);
  };

  const openEdit = (u: any) => {
    setEditingUser(u);
    form.setFieldsValue({ display_name: u.display_name, role: u.role, is_active: u.is_active });
    setModalOpen(true);
  };

  const roleLabel: Record<string, string> = { tester: '化验员', admin: '主管' };

  const columns = [
    { title: '用户名', dataIndex: 'username', width: 130, render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: '显示名', dataIndex: 'display_name', width: 130 },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: (v: string) => <Tag color={v === 'admin' ? 'blue' : 'cyan'} style={{ borderRadius: 6 }}>{roleLabel[v] || v}</Tag>,
    },
    {
      title: '状态', dataIndex: 'is_active', width: 80, align: 'center' as const,
      render: (v: boolean) => v
        ? <Tag color="success" style={{ borderRadius: 6 }}>启用</Tag>
        : <Tag color="default" style={{ borderRadius: 6 }}>已停用</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 180,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title={r.is_active ? '确定停用此账号？' : '确定重新启用？'}
            onConfirm={() => handleToggleActive(r)}
            okText="确定" cancelText="取消"
          >
            <Button type="link" size="small" danger={r.is_active} icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}>
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
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#0891b2' }} />人员管理
          </Typography.Title>
          <Typography.Text type="secondary">管理系统用户账号</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ borderRadius: 8 }}>添加用户</Button>
      </div>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          size="middle"
          loading={loading}
          pagination={{ pageSize: 50 }}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingUser && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input placeholder="登录用户名" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password placeholder="至少3位" />
              </Form.Item>
            </>
          )}
          <Form.Item name="display_name" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input placeholder="如 张化验员" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[
              { label: '化验员', value: 'tester' },
              { label: '主管', value: 'admin' },
            ]} />
          </Form.Item>
          {editingUser && (
            <>
              <Form.Item name="new_password" label="新密码（留空不修改）">
                <Input.Password placeholder="留空则不修改密码" />
              </Form.Item>
              <Form.Item name="is_active" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
