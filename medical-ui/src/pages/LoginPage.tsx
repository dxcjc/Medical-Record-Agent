import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Message, Card, Typography, Avatar } from '@arco-design/web-react';
import { IconUser, IconLock } from '@arco-design/web-react/icon';
import { useAuthStore } from '../stores/authStore';

const FormItem = Form.Item;
const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState('admin.dev@example.local');
  const [password, setPassword] = useState('ChangeMe123!');

  const handleSubmit = async () => {
    if (!email || !password) {
      Message.warning('请输入邮箱和密码');
      return;
    }
    try {
      await login(email, password);
      Message.success('登录成功');
      navigate('/');
    } catch {
      Message.error('登录失败，请检查邮箱和密码');
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-fill-2)',
      }}
    >
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Avatar
            size={56}
            style={{ backgroundColor: 'var(--color-primary-6)', fontSize: 24, fontWeight: 700, marginBottom: 16 }}
          >
            M
          </Avatar>
          <Title heading={4} style={{ marginBottom: 4 }}>Medical Record Agent</Title>
          <Text type="secondary">医疗记录智能识别系统</Text>
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
      </Card>
    </div>
  );
};

export default LoginPage;
