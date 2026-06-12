import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Message } from '@arco-design/web-react';
import { IconUser, IconLock } from '@arco-design/web-react/icon';
import { useAuthStore } from '../stores/authStore';

const FormItem = Form.Item;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState('admin.dev@example.local');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      Message.warning('请输入邮箱和密码');
      return;
    }
    try {
      await login(email, password);
      Message.success('登录成功');
      navigate('/');
    } catch (e: any) {
      Message.error('登录失败，请检查邮箱和密码');
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div style={{
        width: 400,
        background: 'var(--color-bg-white)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'var(--color-primary)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            marginBottom: 16,
          }}>
            M
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>
            Medical Record Agent
          </h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            医疗记录智能识别系统
          </p>
        </div>

        <Form layout="vertical" onSubmit={handleSubmit}>
          <FormItem label="邮箱">
            <Input
              prefix={<IconUser />}
              placeholder="请输入邮箱"
              value={email}
              onChange={setEmail}
              size="large"
            />
          </FormItem>
          <FormItem label="密码">
            <Input.Password
              prefix={<IconLock />}
              placeholder="请输入密码"
              value={password}
              onChange={setPassword}
              size="large"
            />
          </FormItem>
          <FormItem style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              long
              size="large"
              loading={isLoading}
              onClick={handleSubmit}
            >
              登录
            </Button>
          </FormItem>
        </Form>
      </div>
    </div>
  );
};

export default LoginPage;
