import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message, Typography, Card } from 'antd';
import { UserOutlined, LockOutlined, ExperimentOutlined } from '@ant-design/icons';
import { login, getMe } from '../api/endpoints';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      localStorage.setItem('token', res.data.access_token);
      const meRes = await getMe();
      localStorage.setItem('user', JSON.stringify(meRes.data));
      message.success('登录成功');
      navigate('/');
    } catch {
      message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', zIndex: 1, width: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18, margin: '0 auto 16px',
            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
            <ExperimentOutlined style={{ fontSize: 36, color: '#fff' }} />
          </div>
          <Typography.Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 700, letterSpacing: 2 }}>
            水质管理系统
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, letterSpacing: 4 }}>
            海口美兰机场供水站
          </Typography.Text>
        </div>

        {/* Login Card */}
        <Card
          style={{
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.97)',
          }}
          bodyStyle={{ padding: '36px 40px' }}
        >
          <Typography.Title level={5} style={{ textAlign: 'center', marginBottom: 28, color: '#334155', fontWeight: 500 }}>
            登录系统
          </Typography.Title>

          <Form onFinish={handleSubmit} size="large" layout="vertical">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="用户名"
                style={{ borderRadius: 8, height: 46 }}
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="密码"
                style={{ borderRadius: 8, height: 46 }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 46, borderRadius: 8, fontSize: 16, fontWeight: 500,
                  background: 'linear-gradient(135deg, #0e7490, #0891b2)',
                  border: 'none',
                }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          <div style={{
            marginTop: 20, padding: '12px 16px', borderRadius: 8,
            background: '#f8fafc', border: '1px solid #e2e8f0',
          }}>
            <Typography.Text style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              测试账号
            </Typography.Text>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: '#475569' }}>化验员</Typography.Text>
                <br />
                <Typography.Text code style={{ fontSize: 12 }}>zhang / 123456</Typography.Text>
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: '#475569' }}>审核人</Typography.Text>
                <br />
                <Typography.Text code style={{ fontSize: 12 }}>liwei / 123456</Typography.Text>
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: '#475569' }}>管理员</Typography.Text>
                <br />
                <Typography.Text code style={{ fontSize: 12 }}>admin / admin123</Typography.Text>
              </div>
            </div>
          </div>
        </Card>

        <Typography.Text style={{ color: 'rgba(255,255,255,0.5)', display: 'block', textAlign: 'center', marginTop: 20, fontSize: 12 }}>
          GB 5749-2022 · CJ 94-2005 · v1.0
        </Typography.Text>
      </div>
    </div>
  );
}
