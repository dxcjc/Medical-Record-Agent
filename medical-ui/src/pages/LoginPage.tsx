import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Avatar } from '@arco-design/web-react';
import { toast } from '../components/GlobalToast';
import { useAuthStore } from '../stores/authStore';
import { IconUserRound, IconShield } from '../icons/appIcons';

const FormItem = Form.Item;
const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState('admin.dev@example.local');
  const [password, setPassword] = useState('ChangeMe123!');

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.warning('请输入邮箱和密码');
      return;
    }
    try {
      await login(email, password);
      toast.success('登录成功');
      navigate('/');
    } catch {
      toast.error('登录失败，请检查邮箱和密码');
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <Card style={{ width: 400, boxShadow: 'var(--shadow-card)', borderRadius: 'var(--radius-card)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            className="brand-logo"
            style={{ width: 56, height: 56, fontSize: 24, margin: '0 auto 16px', borderRadius: 14 }}
          >
            M
          </div>
          <Title heading={4} style={{ marginBottom: 4 }}>Medical Record Agent</Title>
          <Text type="secondary">医疗记录智能识别系统</Text>
        </div>

        <Form layout="vertical" onSubmit={handleSubmit}>
          <FormItem label="邮箱">
            <Input
              prefix={<IconUserRound size={16} />}
              placeholder="请输入邮箱"
              value={email}
              onChange={setEmail}
              size="large"
            />
          </FormItem>
          <FormItem label="密码">
            <Input.Password
              prefix={<IconShield size={16} />}
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
}
