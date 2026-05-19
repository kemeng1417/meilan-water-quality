import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Badge, Typography } from 'antd';
import {
  DashboardOutlined,
  FormOutlined,
  UnorderedListOutlined,
  LineChartOutlined,
  AlertOutlined,
  EnvironmentOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ExperimentOutlined,
  BellOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '首页看板' },
  { key: '/records', icon: <UnorderedListOutlined />, label: '检测记录' },
  { key: '/records/new', icon: <FormOutlined />, label: '新建报告' },
  { key: '/trends', icon: <LineChartOutlined />, label: '趋势分析' },
  { key: '/alerts', icon: <AlertOutlined />, label: '异常管理' },
  { key: '/points', icon: <EnvironmentOutlined />, label: '采样点管理' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const pathname = location.pathname;
  const selectedKey = pathname === '/' ? '/' : '/' + pathname.split('/').slice(1).join('/');

  const roleLabel: Record<string, string> = { tester: '化验员', reviewer: '审核人', admin: '管理员' };

  const handleMenuClick = (key: string) => {
    // "新建报告"始终导航到无参数的空白页
    if (key === '/records/new') {
      navigate('/records/new');
    } else {
      navigate(key);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          background: 'linear-gradient(180deg, #0c4a6e 0%, #0e7490 50%, #0891b2 100%)',
          borderRight: 'none',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)', margin: '0 12px',
        }}>
          <ExperimentOutlined style={{ fontSize: 22, color: '#7dd3fc', marginRight: collapsed ? 0 : 10 }} />
          {!collapsed && (
            <div>
              <Typography.Text style={{ color: '#fff', fontWeight: 700, fontSize: 15, display: 'block', lineHeight: 1.3 }}>
                水质管理系统
              </Typography.Text>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                美兰机场供水站
              </Typography.Text>
            </div>
          )}
        </div>

        {/* Menu */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
          style={{
            background: 'transparent',
            borderRight: 'none',
            marginTop: 8,
          }}
          theme="dark"
        />
      </Sider>

      <Layout>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          borderBottom: '1px solid #f1f5f9',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, width: 40, height: 40 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge count={0} size="small">
              <BellOutlined style={{ fontSize: 18, color: '#64748b', cursor: 'pointer' }} />
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
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    danger: true,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'logout') {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    navigate('/login');
                  }
                },
              }}
              placement="bottomRight"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0e7490, #0891b2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <UserOutlined style={{ color: '#fff', fontSize: 14 }} />
                </div>
                <Typography.Text style={{ fontSize: 14, color: '#334155' }}>{user.display_name}</Typography.Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 20, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
