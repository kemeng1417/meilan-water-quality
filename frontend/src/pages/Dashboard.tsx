import { useState, useEffect } from 'react';
import { Card, Row, Col, Table, Tag, Typography, Progress, Space, Button } from 'antd';
import {
  CheckCircleOutlined, WarningOutlined, ExperimentOutlined,
  ClockCircleOutlined, DashboardOutlined, EditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { getDashboardSummary, getRecords, getWaterTypes } from '../api/endpoints';
import { WATER_TYPE_COLORS, STATUS_MAP } from '../theme/tokens';

const statCards = [
  { key: 'today_records', label: '今日报告', icon: <ExperimentOutlined />, color: '#1677ff', bg: 'stat-card-primary', nav: '/records' },
  { key: 'this_month_records', label: '本月报告', icon: <ClockCircleOutlined />, color: '#52c41a', bg: 'stat-card-success', nav: '/records' },
  { key: 'pending_review', label: '待审核', icon: <CheckCircleOutlined />, color: '#faad14', bg: 'stat-card-warning', nav: '/records?status=submitted' },
  { key: 'abnormal_count', label: '异常报告', icon: <WarningOutlined />, color: '#ff4d4f', bg: 'stat-card-danger', nav: '/alerts?status=open' },
];

export default function Dashboard() {
  const [summary, setSummary] = useState<any>({});
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getDashboardSummary(),
      getRecords({ page: 1, page_size: 10 }),
      getWaterTypes(),
    ]).then(([s, r, w]) => {
      setSummary(s.data);
      setRecentRecords(r.data.items);
      setWaterTypes(w.data);
    }).finally(() => setLoading(false));
  }, []);

  // Weekly trend chart option
  const trendOption = () => {
    const data = summary.weekly_trend || [];
    const dates = data.map((d: any) => dayjs(d.date).format('MM/DD'));
    const rates = data.map((d: any) => d.qualification_rate);
    const abCounts = data.map((d: any) => d.abnormal);

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 20, left: 40, right: 40, bottom: 30 },
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: 'value' as const, min: 80, max: 100, axisLabel: { fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { type: 'dashed' } } },
        { type: 'value' as const, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: '合格率', type: 'line', data: rates,
          smooth: true, symbol: 'circle', symbolSize: 6,
          itemStyle: { color: '#0891b2' },
          lineStyle: { width: 3 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(8,145,178,0.2)' }, { offset: 1, color: 'rgba(8,145,178,0)' }] } },
          markLine: { silent: true, data: [{ yAxis: 95, label: { formatter: '95%', fontSize: 10 }, lineStyle: { color: '#ff4d4f', type: 'dashed' } }] },
        },
        {
          name: '异常数', type: 'bar', yAxisIndex: 1, data: abCounts,
          itemStyle: { color: '#ffbb96', borderRadius: [4, 4, 0, 0] },
          barWidth: 12,
        },
      ],
    };
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
          <DashboardOutlined style={{ marginRight: 8, color: '#0891b2' }} />
          水质管理看板
        </Typography.Title>
        <Typography.Text type="secondary">{dayjs().format('YYYY年M月D日 dddd')}</Typography.Text>
      </div>

      {/* Stat Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {statCards.map(card => (
          <Col xs={12} sm={6} key={card.key}>
            <Card
              className={`dash-stat-card ${card.bg}`}
              style={{ borderRadius: 12, border: 'none' }}
              bodyStyle={{ padding: '18px 22px' }}
              onClick={() => navigate(card.nav)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Typography.Text style={{ fontSize: 13, color: '#64748b' }}>{card.label}</Typography.Text>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    {(summary as any)[card.key] ?? 0}
                  </div>
                </div>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: 'rgba(255,255,255,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 20, color: card.color }}>{card.icon}</span>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Weekly Trend */}
        <Col xs={24} lg={14}>
          <Card
            title={<Typography.Text strong>近 7 天合格率趋势</Typography.Text>}
            style={{ borderRadius: 12, marginBottom: 16 }}
            bodyStyle={{ padding: '8px 16px 16px' }}
          >
            {summary.weekly_trend ? (
              <ReactECharts option={trendOption()} style={{ height: 220 }} />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>加载中...</div>
            )}
          </Card>
        </Col>

        {/* Right Panel: Today Progress + Top Failed */}
        <Col xs={24} lg={10}>
          {/* Today Progress */}
          <Card
            title={<Typography.Text strong>今日检测进度</Typography.Text>}
            style={{ borderRadius: 12, marginBottom: 16 }}
            bodyStyle={{ padding: '12px 20px' }}
          >
            {!summary.today_detail || summary.today_detail.length === 0 ? (
              <Typography.Text type="secondary">今日尚无检测记录</Typography.Text>
            ) : (
              summary.today_detail.map((item: any) => {
                const wt = waterTypes.find((w: any) => w.id === item.water_type_id);
                const wtCode = wt?.code || '';
                return (
                  <div key={item.water_type_name} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Space size={6}>
                        <Tag color={WATER_TYPE_COLORS[wtCode] || 'default'} style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>
                          {item.water_type_name}
                        </Tag>
                        {item.status === 'none' ? (
                          <Tag color="default" style={{ borderRadius: 4, fontSize: 10 }}>未创建</Tag>
                        ) : (
                          <Tag color={STATUS_MAP[item.status]?.color} style={{ borderRadius: 4, fontSize: 10 }}>
                            {STATUS_MAP[item.status]?.label}
                          </Tag>
                        )}
                      </Space>
                      <Typography.Text style={{ fontSize: 12, color: item.has_abnormal ? '#ff4d4f' : '#52c41a' }}>
                        {item.fill_rate}%
                      </Typography.Text>
                    </div>
                    {item.status !== 'none' && (
                      <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/records/${item.record_id}`)}>
                        <Progress
                          percent={item.fill_rate}
                          size="small"
                          strokeColor={item.fill_rate === 100 ? '#52c41a' : item.has_abnormal ? '#ff4d4f' : '#0891b2'}
                        />
                      </div>
                    )}
                    {item.status === 'none' && (
                      <Button type="dashed" size="small" block icon={<EditOutlined />}
                        onClick={() => navigate('/records/entry')} style={{ borderRadius: 6 }}>
                        新建
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </Card>

          {/* Top Failed Indicators */}
          <Card
            title={<Typography.Text strong>本月超标指标排行</Typography.Text>}
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: '12px 20px' }}
          >
            {!summary.top_failed || summary.top_failed.length === 0 ? (
              <Typography.Text type="secondary">本月无超标记录</Typography.Text>
            ) : (
              summary.top_failed.map((item: any, idx: number) => (
                <div key={item.indicator_name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: idx < summary.top_failed.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <Space size={8}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: idx === 0 ? '#fff2f0' : '#f8fafc',
                      color: idx === 0 ? '#ff4d4f' : '#64748b',
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {idx + 1}
                    </span>
                    <Typography.Text style={{ fontSize: 13 }}>{item.indicator_name}</Typography.Text>
                  </Space>
                  <Tag color="error" style={{ borderRadius: 10 }}>{item.count}次</Tag>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent Records */}
      <Card
        title={
          <Space>
            <Typography.Text strong style={{ fontSize: 15 }}>最近检测记录</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>点击行查看详情</Typography.Text>
          </Space>
        }
        style={{ borderRadius: 12, marginTop: 16 }}
        bodyStyle={{ padding: '0 24px 24px' }}
      >
        <Table
          dataSource={recentRecords}
          rowKey="id"
          size="middle"
          loading={loading}
          pagination={false}
          columns={[
            { title: '报告编号', dataIndex: 'record_no', width: 170, render: (v: string) => <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text> },
            {
              title: '类型', dataIndex: 'water_type_id', width: 100,
              render: (v: number) => {
                const wt = waterTypes.find(w => w.id === v);
                return <Tag color={WATER_TYPE_COLORS[wt?.code || ''] || 'default'} style={{ borderRadius: 6 }}>{wt?.name || v}</Tag>;
              },
            },
            { title: '化验日期', dataIndex: 'test_date', width: 110 },
            { title: '化验员', dataIndex: 'tester', width: 90 },
            {
              title: '状态', dataIndex: 'status', width: 80,
              render: (s: string) => <Tag color={STATUS_MAP[s]?.color} style={{ borderRadius: 6 }}>{STATUS_MAP[s]?.label || s}</Tag>,
            },
            {
              title: '异常', width: 70, align: 'center' as const,
              render: (_: any, r: any) => r.is_abnormal
                ? <Tag color="error" style={{ borderRadius: 10 }}>异常</Tag>
                : <span style={{ color: '#52c41a', fontSize: 12 }}>✓</span>,
            },
          ]}
          onRow={r => ({ onClick: () => navigate(`/records/${r.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </div>
  );
}
