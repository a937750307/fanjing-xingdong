import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ConfigProvider, App as AntApp, Layout, Menu, Table, Button, Input, Modal, Form,
  Space, Tag, Typography, Card, Statistic, Row, Col, Switch, Select, InputNumber,
  Popconfirm, Badge, Empty, Divider, Tooltip
} from 'antd';
import {
  DashboardOutlined, TeamOutlined, NotificationOutlined, InfoCircleOutlined,
  SettingOutlined, LogoutOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  EditOutlined, StopOutlined, CheckCircleOutlined, KeyOutlined, HistoryOutlined,
  MessageOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'antd/dist/reset.css';

dayjs.locale('zh-cn');
const { Header, Sider, Content } = Layout;
const { Text, Title, Paragraph } = Typography;

const TK = 'saltline.admin.token';
let tok = '';
try { tok = localStorage.getItem(TK) || ''; } catch (e) {}

async function api(p, opt) {
  opt = opt || {};
  const r = await fetch('/api/admin' + p, {
    method: opt.method || 'GET',
    headers: Object.assign(
      { 'content-type': 'application/json' },
      tok ? { authorization: 'Bearer ' + tok } : {},
      opt.headers || {}
    ),
    body: opt.body,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (r.status === 401) {
    try { localStorage.removeItem(TK); } catch (e) {}
    tok = '';
    throw new Error('会话已过期，请重新登录');
  }
  if (!r.ok) throw new Error(j.err || ('请求失败 ' + r.status));
  return j;
}

const fmt = t => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '—');
const ago = t => {
  if (!t) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
};

/* ---------------- 登录 ---------------- */
function Login({ onOk }) {
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  async function submit(v) {
    setLoading(true);
    try {
      const j = await api('/login', { method: 'POST', body: JSON.stringify(v) });
      tok = j.token;
      try { localStorage.setItem(TK, tok); } catch (e) {}
      message.success('已登录');
      onOk();
    } catch (e) {
      message.error(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(150deg,#0f1720 0%,#1a2733 55%,#0d1319 100%)',
    }}>
      <Card style={{ width: 380, boxShadow: '0 18px 60px rgba(0,0,0,.45)' }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Title level={3} style={{ margin: 0, letterSpacing: 2 }}>FANWHALE</Title>
          <Text type="secondary" style={{ fontSize: 12, letterSpacing: 3 }}>管理后台</Text>
        </div>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="u" label="管理员账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="p" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>登录</Button>
        </Form>
      </Card>
    </div>
  );
}

/* ---------------- 概览 ---------------- */
function Overview({ stats, onRefresh }) {
  const items = [
    ['注册用户', stats.users, '#1677ff'],
    ['在线玩家', stats.online, '#52c41a'],
    ['封禁账号', stats.banned, '#ff4d4f'],
    ['聊天消息', stats.msgs, '#722ed1'],
    ['公告条数', stats.notices, '#faad14'],
  ];
  return (
    <div>
      <Row gutter={[16, 16]}>
        {items.map(([t, v, c]) => (
          <Col xs={12} sm={8} md={8} lg={4} key={t} flex="1 1 160px">
            <Card size="small" bordered={false} style={{ boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
              <Statistic title={t} value={v} valueStyle={{ color: c, fontWeight: 600 }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card size="small" title="系统状态" style={{ marginTop: 16 }}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>}>
        <Space size={28} wrap>
          <span><Badge status="processing" /> 服务运行 {Math.floor((stats.uptime || 0) / 60)} 分钟</span>
          <span>开放注册：<Tag color={stats.allowRegister ? 'green' : 'red'}>{stats.allowRegister ? '是' : '否'}</Tag></span>
          <span>接口：<Text code>/api</Text></span>
        </Space>
        <Divider style={{ margin: '14px 0' }} />
        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
          后台地址 <Text code>/admin/</Text> · 游戏地址 <Text code>/</Text> · 数据目录 <Text code>/www/wwwroot/saltline-api/data</Text>
        </Paragraph>
      </Card>
    </div>
  );
}

/* ---------------- 用户管理 ---------------- */
function Users() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState({ list: [], total: 0 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [banTarget, setBanTarget] = useState(null);
  const [banForm] = Form.useForm();
  const [passInfo, setPassInfo] = useState(null);

  const load = useCallback(async (p, s, kw) => {
    setLoading(true);
    try {
      const j = await api('/users?page=' + (p || page) + '&size=' + (s || size) + '&q=' + encodeURIComponent(kw === undefined ? q : kw));
      setData({ list: j.list, total: j.total });
    } catch (e) { message.error(e.message); }
    setLoading(false);
  }, [page, size, q]);

  useEffect(() => { load(1, size, ''); }, []);

  async function doBan() {
    const v = await banForm.validateFields();
    try {
      const j = await api('/ban', { method: 'POST', body: JSON.stringify({ u: banTarget.u, days: v.days, reason: v.reason }) });
      message.success('已封禁' + (j.kicked ? '，踢下线 ' + j.kicked + ' 个会话' : ''));
      setBanTarget(null);
      load();
    } catch (e) { message.error(e.message); }
  }

  async function resetPass(u) {
    try {
      const j = await api('/user/pass', { method: 'POST', body: JSON.stringify({ u }) });
      setPassInfo({ u, pass: j.pass });
      message.success('口令已重置');
      load();
    } catch (e) { message.error(e.message); }
  }

  async function unban(u) {
    try { await api('/unban', { method: 'POST', body: JSON.stringify({ u }) }); message.success('已解封'); load(); }
    catch (e) { message.error(e.message); }
  }

  async function del(u) {
    try { await api('/user/del', { method: 'POST', body: JSON.stringify({ u }) }); message.success('已删除'); load(); }
    catch (e) { message.error(e.message); }
  }

  const columns = [
    {
      title: '昵称', dataIndex: 'u', width: 170,
      render: (v, r) => (
        <Space size={6}>
          <Text strong>{v}</Text>
          {r.online ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>}
        </Space>
      ),
    },
    { title: '注册时间', dataIndex: 'created', width: 160, render: v => <Text type="secondary">{fmt(v)}</Text> },
    { title: '最后活跃', dataIndex: 'last', width: 130, render: v => <Tooltip title={fmt(v)}><Text type="secondary">{ago(v)}</Text></Tooltip> },
    {
      title: '状态', dataIndex: 'banned', width: 200,
      render: (b, r) => b
        ? <Tooltip title={r.ban && r.ban.reason ? ('原因：' + r.ban.reason) : ''}>
            <Tag color="red">{r.ban && r.ban.until ? '封禁至 ' + dayjs(r.ban.until).format('MM-DD HH:mm') : '永久封禁'}</Tag>
          </Tooltip>
        : <Tag color="blue">正常</Tag>,
    },
    {
      title: '操作', key: 'op', width: 220,
      render: (_, r) => (
        <Space size={4}>
          {r.banned
            ? <Button size="small" icon={<CheckCircleOutlined />} onClick={() => unban(r.u)}>解封</Button>
            : <Button size="small" danger icon={<StopOutlined />}
                onClick={() => { banForm.setFieldsValue({ days: 7, reason: '' }); setBanTarget(r); }}>封禁</Button>}
          <Popconfirm title={'重置 ' + r.u + ' 的口令？'} description="会立刻踢下线，并生成一个 10 位随机口令"
            onConfirm={() => resetPass(r.u)}>
            <Button size="small" icon={<KeyOutlined />} title="重置口令" />
          </Popconfirm>
          <Popconfirm title={'删除用户 ' + r.u + '？'} description="账号与凭证一起清除，不可恢复" onConfirm={() => del(r.u)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除账号" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card size="small" title={'用户管理（共 ' + data.total + ' 人）'}
      extra={
        <Input.Search placeholder="搜索昵称" allowClear style={{ width: 220 }}
          onSearch={v => { setQ(v); setPage(1); load(1, size, v); }} />
      }>
      <Table
        rowKey="key" size="middle" loading={loading} columns={columns} dataSource={data.list}
        pagination={{
          current: page, pageSize: size, total: data.total, showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: t => '共 ' + t + ' 条',
          onChange: (p, s) => { setPage(p); setSize(s); load(p, s); },
        }}
        locale={{ emptyText: <Empty description="还没有用户" /> }}
      />
      <Modal
        title={'封禁 ' + (banTarget ? banTarget.u : '')}
        open={!!banTarget} onCancel={() => setBanTarget(null)} onOk={doBan}
        okText="确认封禁" okButtonProps={{ danger: true }} destroyOnClose>
        <Form form={banForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="days" label="封禁天数（0 = 永久）" initialValue={7}>
            <InputNumber min={0} max={3650} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="原因（会在登录提示中显示给玩家）">
            <Input.TextArea rows={3} maxLength={80} showCount placeholder="例如：大厅刷屏 / 使用外挂" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="新口令" open={!!passInfo} onCancel={() => setPassInfo(null)} footer={null} destroyOnClose>
        {passInfo && (
          <div>
            <p style={{ marginBottom: 10 }}>{passInfo.u} 的口令已重置，请把这个口令交给对方（只显示这一次）：</p>
            <div style={{
              padding: '14px 16px', background: '#f6f8fa', border: '1px solid #e5e7eb', borderRadius: 6,
              fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 20, letterSpacing: 2, textAlign: 'center',
              userSelect: 'all', cursor: 'text'
            }}>{passInfo.pass}</div>
            <p style={{ marginTop: 10, fontSize: 12, color: '#888' }}>旧口令立即失效，对方的其它登录会话已被踢出。</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ---------------- 公告管理 ---------------- */
function Notices() {
  const { message } = AntApp.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try { const j = await api('/notices'); setList(j.list); }
    catch (e) { message.error(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    form.setFieldsValue({ id: null, title: '', body: '', level: 'info', active: true });
    setEditing({});
  }
  function openEdit(r) {
    form.setFieldsValue({ id: r.id, title: r.title, body: r.body, level: r.level, active: r.active });
    setEditing(r);
  }

  async function save() {
    const v = await form.validateFields();
    try {
      await api('/notice', { method: 'POST', body: JSON.stringify(v) });
      message.success('已保存');
      setEditing(null); load();
    } catch (e) { message.error(e.message); }
  }

  async function del(id) {
    try { await api('/notice/del', { method: 'POST', body: JSON.stringify({ id }) }); message.success('已删除'); load(); }
    catch (e) { message.error(e.message); }
  }

  async function toggle(r) {
    try {
      await api('/notice', { method: 'POST', body: JSON.stringify({ id: r.id, title: r.title, body: r.body, level: r.level, active: !r.active }) });
      load();
    } catch (e) { message.error(e.message); }
  }

  const LV = { info: ['blue', '通知'], warning: ['orange', '警告'], success: ['green', '活动'], error: ['red', '紧急'] };

  const columns = [
    { title: '#', dataIndex: 'id', width: 60 },
    { title: '标题', dataIndex: 'title', render: v => <Text strong>{v}</Text> },
    {
      title: '级别', dataIndex: 'level', width: 90,
      render: v => <Tag color={(LV[v] || LV.info)[0]}>{(LV[v] || LV.info)[1]}</Tag>,
    },
    {
      title: '状态', dataIndex: 'active', width: 90,
      render: (v, r) => <Switch size="small" checked={v} onChange={() => toggle(r)} />,
    },
    { title: '更新时间', dataIndex: 'updated', width: 160, render: v => <Text type="secondary">{fmt(v)}</Text> },
    {
      title: '操作', key: 'op', width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="删除这条公告？" onConfirm={() => del(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除账号" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card size="small" title={'公告管理（' + list.filter(x => x.active).length + ' 条生效）'}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openNew}>新建公告</Button>}>
      <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={list}
        pagination={{ pageSize: 10, showTotal: t => '共 ' + t + ' 条' }}
        locale={{ emptyText: <Empty description="还没有公告，玩家打开游戏不会看到弹窗" /> }} />
      <Modal title={editing && editing.id ? '编辑公告' : '新建公告'} open={!!editing}
        onCancel={() => setEditing(null)} onOk={save} okText="保存" width={620} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input maxLength={60} showCount placeholder="例如：服务器维护公告" />
          </Form.Item>
          <Form.Item name="body" label="内容（玩家弹窗里按纯文本显示，换行保留）">
            <Input.TextArea rows={6} maxLength={2000} showCount placeholder="写点什么…" />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="level" label="级别" style={{ marginBottom: 0 }}>
              <Select style={{ width: 140 }} options={[
                { value: 'info', label: '通知' }, { value: 'warning', label: '警告' },
                { value: 'success', label: '活动' }, { value: 'error', label: '紧急' },
              ]} />
            </Form.Item>
            <Form.Item name="active" label="立即生效" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}

/* ---------------- 关于游戏 ---------------- */
function About() {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/about').then(j => form.setFieldsValue({ title: j.about.title, body: j.about.body })).catch(e => message.error(e.message));
  }, []);

  async function save(v) {
    setLoading(true);
    try {
      await api('/about', { method: 'POST', body: JSON.stringify(v) });
      message.success('已保存，玩家端设置里「关于」即时更新');
    } catch (e) { message.error(e.message); }
    setLoading(false);
  }

  return (
    <Card size="small" title="关于游戏（显示在游戏内 设置 → 关于）">
      <Form form={form} layout="vertical" style={{ maxWidth: 720 }} onFinish={save}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
          <Input maxLength={60} showCount />
        </Form.Item>
        <Form.Item name="body" label="内容">
          <Input.TextArea rows={10} maxLength={4000} showCount
            placeholder={'可以写版本号、制作说明、联系方式、感谢名单…\n换行会原样保留。'} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={loading}>保存</Button>
        </Form.Item>
      </Form>
      <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
        玩家在游戏暂停 → 设置 → 关于 里看到的正文就是这段。默认标题「关于 Saltline」。
      </Paragraph>
    </Card>
  );
}

/* ---------------- 系统设置 ---------------- */
function Settings({ stats, onRefresh }) {
  const { message } = AntApp.useApp();
  const [allow, setAllow] = useState(stats.allowRegister);
  const [busy, setBusy] = useState(false);

  async function toggle(v) {
    setBusy(true);
    try {
      const j = await api('/config', { method: 'POST', body: JSON.stringify({ allowRegister: v }) });
      setAllow(j.config.allowRegister);
      message.success(v ? '已开放注册' : '已关闭注册');
      onRefresh();
    } catch (e) { message.error(e.message); }
    setBusy(false);
  }

  return (
    <Card size="small" title="系统设置">
      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <div>
          <Text strong>开放新用户注册</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>关闭后新玩家只能在登录页看到「当前暂停开放注册」，老玩家照常登录。</Text></div>
          <Switch checked={allow} loading={busy} onChange={toggle} style={{ marginTop: 8 }} />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div>
          <Text strong>运行信息</Text>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#666', fontSize: 13, lineHeight: 2 }}>
            <li>API 进程：pm2 <Text code>saltline-api</Text>（127.0.0.1:7801）</li>
            <li>数据目录：<Text code>/www/wwwroot/saltline-api/data</Text></li>
            <li>已运行：{Math.floor((stats.uptime || 0) / 60)} 分钟</li>
            <li>重置管理员密码：删除 data/admin.json 后重启进程，会重新生成并写进 data/admin-init.txt</li>
          </ul>
        </div>
      </Space>
    </Card>
  );
}

/* ---------------- 外壳 ---------------- */
function Admin({ onLogout }) {
  const { message } = AntApp.useApp();
  const [view, setView] = useState('overview');
  const [stats, setStats] = useState({ users: 0, online: 0, banned: 0, msgs: 0, notices: 0, allowRegister: true, uptime: 0 });

  const loadStats = useCallback(() => {
    api('/stats').then(setStats).catch(e => message.error(e.message));
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const menu = [
    { key: 'overview', icon: <DashboardOutlined />, label: '概览' },
    { key: 'feedback', icon: <MessageOutlined />, label: '意见反馈' },
    { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
    { key: 'notices', icon: <NotificationOutlined />, label: '公告管理' },
    { key: 'about', icon: <InfoCircleOutlined />, label: '关于游戏' },
    { key: 'audit', icon: <HistoryOutlined />, label: '操作日志' },
    { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
  ];

  const [collapsed, setCollapsed] = useState(false);
  let body = null;
  if (view === 'overview') body = <Overview stats={stats} onRefresh={loadStats} />;
  else if (view === 'feedback') body = <Feedback />;
  else if (view === 'users') body = <Users />;
  else if (view === 'notices') body = <Notices />;
  else if (view === 'about') body = <About />;
  else if (view === 'audit') body = <Audit />;
  else body = <Settings stats={stats} onRefresh={loadStats} />;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="dark"
        width={208}
      >
        <div style={{ padding: '18px 16px 14px', color: '#fff' }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2 }}>FANWHALE</div>
          <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 3, marginTop: 2 }}>ADMIN CONSOLE</div>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[view]} items={menu} onClick={e => setView(e.key)} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Title level={5} style={{ margin: 0 }}>{(menu.find(m => m.key === view) || {}).label}</Title>
            <Tag color="green">在线 {stats.online}</Tag>
            <Tag>用户 {stats.users}</Tag>
            {stats.banned > 0 && <Tag color="red">封禁 {stats.banned}</Tag>}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadStats} type="text" />
            <Button icon={<LogoutOutlined />} onClick={onLogout}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 18, background: '#f5f6f8' }}>
          <Boundary key={view}>{body}</Boundary>
        </Content>
      </Layout>
    </Layout>
  );
}

/* ---------------- 错误边界 ---------------- */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e, info) { try { console.error('[admin]', e, info); } catch (x) {} }
  render() {
    if (this.state.err) {
      return (
        <Card title="这个页面出错了">
          <Paragraph type="danger" style={{ fontFamily: 'ui-monospace,monospace', whiteSpace: 'pre-wrap' }}>
            {String((this.state.err && this.state.err.message) || this.state.err)}
          </Paragraph>
          <Space>
            <Button type="primary" onClick={() => this.setState({ err: null })}>重试</Button>
            <Button onClick={() => location.reload()}>刷新页面</Button>
          </Space>
        </Card>
      );
    }
    return this.props.children;
  }
}

/* ---------------- 意见反馈 ---------------- */
function Feedback() {
  const { message } = AntApp.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stat, setStat] = useState({ total: 0, open: 0 });
  const [draft, setDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await api('/feedback');
      setList(j.list || []);
      setStat({ total: j.total || 0, open: j.open || 0 });
    } catch (e) {
      message.error('加载失败');
    }
    setLoading(false);
  }, [message]);

  useEffect(() => { load(); }, [load]);

  const send = async (id) => {
    const v = (draft[id] || '').trim();
    if (!v) { message.warning('先写点内容'); return; }
    try {
      await api('/fb-reply', { method: 'POST', body: JSON.stringify({ id, reply: v }) });
      message.success('已回复');
      setDraft(Object.assign({}, draft, { [id]: '' }));
      load();
    } catch (e) { message.error('回复失败'); }
  };

  const del = async (id) => {
    try {
      await api('/fb-del', { method: 'POST', body: JSON.stringify({ id }) });
      message.success('已删除');
      load();
    } catch (e) { message.error('删除失败'); }
  };

  return (
    <Card
      loading={loading}
      title={'意见反馈 · 共 ' + stat.total + ' 条，待回复 ' + stat.open}
      extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
    >
      {list.length === 0 ? <Empty description="还没有收到反馈" /> : list.map(x => (
        <div key={x.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '14px 0' }}>
          <Space size={8} wrap style={{ marginBottom: 6 }}>
            <Tag color={x.reply ? 'green' : 'orange'}>{x.reply ? '已回复' : '待回复'}</Tag>
            <Text strong>{x.nick || x.u}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(x.at).format('MM-DD HH:mm')}</Text>
          </Space>
          <Paragraph style={{ margin: '4px 0 10px', whiteSpace: 'pre-wrap' }}>{x.text}</Paragraph>
          {x.reply ? (
            <div style={{ background: '#f6ffed', borderLeft: '3px solid #52c41a', padding: '8px 12px', marginBottom: 10 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>官方回复 · {dayjs(x.replyAt).format('MM-DD HH:mm')}</Text>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{x.reply}</div>
            </div>
          ) : null}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={x.reply ? '修改回复…' : '写回复…'}
              value={draft[x.id] || ''}
              onChange={e => setDraft(Object.assign({}, draft, { [x.id]: e.target.value }))}
              onPressEnter={() => send(x.id)}
            />
            <Button type="primary" onClick={() => send(x.id)}>{x.reply ? '更新' : '回复'}</Button>
            <Popconfirm title="删除这条反馈？" okText="删除" cancelText="取消" onConfirm={() => del(x.id)}>
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space.Compact>
        </div>
      ))}
    </Card>
  );
}

/* ---------------- 操作日志 ---------------- */
function Audit() {
  const { message } = AntApp.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await api('/audit');
      setList(j.list || []);
    } catch (e) { message.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const ACT = {
    ban: ['封禁', 'red'], unban: ['解封', 'green'], 'reset-pass': ['重置口令', 'orange'],
    'user-del': ['删除账号', 'volcano'], notice: ['公告变更', 'blue'],
    about: ['关于页变更', 'blue'], config: ['系统设置', 'purple'], 'chat-del': ['删除消息', 'magenta'],
  };

  const cols = [
    { title: '时间', dataIndex: 't', width: 190,
      render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '动作', dataIndex: 'act', width: 120,
      render: v => { const a = ACT[v] || [v, 'default']; return <Tag color={a[1]}>{a[0]}</Tag>; } },
    { title: '对象', dataIndex: 'target', width: 160, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: '详情', key: 'd',
      render: (_, r) => {
        const parts = [];
        if (r.days !== undefined) parts.push(r.days > 0 ? ('封 ' + r.days + ' 天') : '永久');
        if (r.reason) parts.push(r.reason);
        if (r.generated) parts.push('随机生成');
        return <span style={{ color: '#666', fontSize: 12 }}>{parts.join(' · ') || '—'}</span>;
      } },
  ];

  return (
    <Card size="small" title={'操作日志（最近 ' + list.length + ' 条）'}
      extra={<Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>}>
      <Table rowKey={(r, i) => i} size="small" loading={loading} dataSource={list} columns={cols}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="还没有管理动作" /> }} />
    </Card>
  );
}

function App() {
  const { message } = AntApp.useApp();
  const [ok, setOk] = useState(!!tok);
  const [checking, setChecking] = useState(!!tok);

  useEffect(() => {
    if (!tok) { setChecking(false); return; }
    api('/stats').then(() => { setOk(true); setChecking(false); })
      .catch(() => { setOk(false); setChecking(false); });
  }, []);

  if (checking) return <div style={{ padding: 80, textAlign: 'center' }}>校验会话…</div>;
  if (!ok) return <Login onOk={() => setOk(true)} />;
  return <Admin onLogout={async () => {
    try { await api('/logout', { method: 'POST' }).catch(() => {}); } catch (e) {}
    tok = '';
    try { localStorage.removeItem(TK); } catch (e) {}
    setOk(false);
    message.success('已退出');
  }} />;
}

createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>
);