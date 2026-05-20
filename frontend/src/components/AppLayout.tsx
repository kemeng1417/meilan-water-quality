import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Badge, Typography, Avatar, Space, Modal, Input, message } from 'antd';
import {
  DashboardOutlined,
  FormOutlined,
  UnorderedListOutlined,
  LineChartOutlined,
  AlertOutlined,
  EnvironmentOutlined,
  LogoutOutlined,
  UserOutlined,
  ExperimentOutlined,
  BellOutlined,
  TeamOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { changePassword } from '../api/endpoints';

const { Header, Content } = Layout;

export default function AppLayout() {
  const [passwordModal, setPasswordModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '首页看板' },
    { key: '/records', icon: <UnorderedListOutlined />, label: '检测记录' },
    { key: '/records/entry', icon: <FormOutlined />, label: '新建报告' },
    { key: '/trends', icon: <LineChartOutlined />, label: '趋势分析' },
    { key: '/alerts', icon: <AlertOutlined />, label: '异常管理' },
    { key: '/points', icon: <EnvironmentOutlined />, label: '采样点管理' },
    ...(user.role === 'admin' ? [{ key: '/users', icon: <TeamOutlined />, label: '人员管理' }] : []),
  ];

  const pathname = location.pathname;
  const getSelectedKey = () => {
    const p = '/' + pathname.split('/').slice(1).join('/');
    if (menuItems.find(m => m.key === p)) return p;
    if (p.startsWith('/records')) return '/records';
    return '/';
  };

  const selectedKey = getSelectedKey();

  const roleLabel: Record<string, string> = { tester: '化验员', admin: '主管' };

  const handleMenuClick = (key: string) => {
    if (key === '/records/entry') {
      navigate('/records/entry');
    } else {
      navigate(key);
    }
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { message.warning('请填写完整'); return; }
    if (newPwd.length < 3) { message.warning('新密码至少3位'); return; }
    setPwdLoading(true);
    try {
      await changePassword(oldPwd, newPwd);
      message.success('密码已修改');
      setPasswordModal(false); setOldPwd(''); setNewPwd('');
    } catch { message.error('修改失败，请检查原密码'); }
    finally { setPwdLoading(false); }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: 56,
        background: '#fff',
        borderBottom: '1px solid #e8ecf1',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        lineHeight: '56px',
      }}>
        {/* Logo + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}
          onClick={() => navigate('/')}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #0c4a6e, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ExperimentOutlined style={{ fontSize: 18, color: '#7dd3fc' }} />
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <Typography.Text style={{ fontWeight: 700, fontSize: 15, color: '#0c4a6e' }}>水质管理系统</Typography.Text>
            <br />
            <Typography.Text style={{ fontSize: 10, color: '#94a3b8' }}>美兰机场供水站</Typography.Text>
          </div>
        </div>

        {/* Navigation Menu */}
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
          style={{
            flex: 1,
            justifyContent: 'center',
            borderBottom: 'none',
            background: 'transparent',
            fontWeight: 500,
            fontSize: 14,
            marginLeft: 24,
          }}
          theme="light"
        />

        {/* Right: Notifications + User */}
        <Space size={16} style={{ flexShrink: 0 }}>
          <Badge count={0} size="small">
            <BellOutlined style={{ fontSize: 17, color: '#64748b', cursor: 'pointer' }} />
          </Badge>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'info',
                  label: (
                    <div style={{ padding: '4px 0' }}>
                      <div style={{ fontWeight: 600 }}>{user.display_name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{roleLabel[user.role] || user.role}</div>
                    </div>
                  ),
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'password',
                  icon: <KeyOutlined />,
                  label: '修改密码',
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  danger: true,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'password') {
                  setPasswordModal(true);
                } else if (key === 'logout') {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  navigate('/login');
                }
              },
            }}
            placement="bottomRight"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size={32} icon={<UserOutlined />} style={{ background: 'linear-gradient(135deg, #0e7490, #0891b2)' }} />
              <Typography.Text style={{ fontSize: 13, color: '#334155' }}>{user.display_name}</Typography.Text>
            </div>
          </Dropdown>
        </Space>
      </Header>

      <Content style={{ margin: '20px 24px', minHeight: 280 }}>
        <Outlet />
      </Content>

      {/* Change Password Modal */}
      <Modal
        title="修改密码"
        open={passwordModal}
        onOk={handleChangePwd}
        onCancel={() => { setPasswordModal(false); setOldPwd(''); setNewPwd(''); }}
        confirmLoading={pwdLoading}
        okText="确认修改"
        cancelText="取消"
      >
        <Input.Password
          value={oldPwd}
          onChange={e => setOldPwd(e.target.value)}
          placeholder="原密码"
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
        <Input.Password
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          placeholder="新密码（至少3位）"
          style={{ borderRadius: 8 }}
        />
      </Modal>
    </Layout>
  );
}
