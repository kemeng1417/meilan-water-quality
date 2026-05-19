import { useState, useEffect, useMemo } from 'react';
import {
  Card, Select, DatePicker, Button, Space, Typography, Spin, Empty,
  Row, Col, Table, Radio, Tooltip, Statistic, Divider,
} from 'antd';
import {
  LineChartOutlined, BarChartOutlined, ClearOutlined,
  WarningOutlined, DownloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import {
  getIndicators, getSamplePoints, getWaterTypes, getTrendData, getLimits,
} from '../api/endpoints';

interface LimitInfo {
  indicator_id: number; min_value: number | null; max_value: number | null;
  qual_check: string | null;
}

export default function TrendAnalysis() {
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string }[]>([]);
  const [indicators, setIndicators] = useState<{ id: number; name: string; unit: string | null; value_type: string }[]>([]);
  const [points, setPoints] = useState<{ id: number; name: string; code: string; area: string }[]>([]);
  const [limits, setLimits] = useState<LimitInfo[]>([]);
  const [selectedWt, setSelectedWt] = useState<number | undefined>();
  const [selectedInds, setSelectedInds] = useState<number[]>([]);
  const [selectedPts, setSelectedPts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  useEffect(() => {
    getWaterTypes().then(res => setWaterTypes(res.data));
  }, []);

  useEffect(() => {
    if (selectedWt) {
      getIndicators(selectedWt).then(res => setIndicators(res.data));
      getSamplePoints(selectedWt).then(res => setPoints(res.data));
      getLimits(selectedWt).then(res => setLimits(res.data));
    }
  }, [selectedWt]);

  const handleQuery = async () => {
    if (!selectedInds.length || !selectedPts.length) { return; }
    setLoading(true);
    try {
      const res = await getTrendData({
        indicator_ids: selectedInds.join(','),
        sampling_point_ids: selectedPts.join(','),
        start_date: startDate,
        end_date: endDate,
      });
      setChartData(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  };

  // ── Build ECharts option ──
  const getChartOption = () => {
    if (!chartData.length) return {};

    const dates = [...new Set(chartData.map(d => d.test_date))].sort();
    const selectedIndicatorObjs = indicators.filter(i => selectedInds.includes(i.id));

    // Group: indicator_name | point_name
    const groups = new Map<string, { indName: string; indUnit: string; point: string; data: number[]; raw: any[] }>();
    chartData.forEach(d => {
      const key = `${d.indicator_name} | ${d.point_name}`;
      if (!groups.has(key)) {
        groups.set(key, { indName: d.indicator_name, indUnit: d.unit || '', point: d.point_name, data: Array(dates.length).fill(null), raw: [] });
      }
      const g = groups.get(key)!;
      const idx = dates.indexOf(d.test_date);
      if (idx >= 0) { g.data[idx] = d.value_num; g.raw.push(d); }
    });

    // ── Unit-based dual Y axis ──
    const uniqueUnits = [...new Set(selectedIndicatorObjs.map(i => i.unit || ''))];
    const useDualAxis = uniqueUnits.length >= 2;

    const series: any[] = [];
    const colors = ['#0891b2', '#0e7490', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc',
      '#f97316', '#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];

    let colorIdx = 0;
    groups.forEach((g, key) => {
      const color = colors[colorIdx % colors.length];
      const unitIdx = uniqueUnits.indexOf(g.indUnit);
      const hasFail = g.raw.some(d => d.is_qualified === false);
      const failPts = g.data.map((v, i) => {
        const d = g.raw.find(r => r.test_date === dates[i]);
        return d && d.is_qualified === false ? { coord: [dates[i], v] as [string, number | null], value: d.value_text } : null;
      }).filter((p): p is { coord: [string, number | null]; value: string } => p !== null);

      series.push({
        name: key,
        type: chartType,
        data: g.data,
        yAxisIndex: useDualAxis ? unitIdx : 0,
        smooth: chartType === 'line',
        symbol: 'circle',
        symbolSize: hasFail ? 8 : 5,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        ...(chartType === 'bar' ? { barMaxWidth: 20 } : {}),
        // Abnormal mark points
        markPoint: hasFail ? {
          data: failPts.map(p => ({
            name: '超标',
            coord: p.coord,
            value: p.value,
            symbol: 'pin',
            symbolSize: 28,
            itemStyle: { color: '#ff4d4f' },
          })),
          label: { show: false },
        } : undefined,
      });
      colorIdx++;
    });

    // ── Limit lines ──
    const limitLines: any[] = [];
    selectedIndicatorObjs.forEach(ind => {
      const lim = limits.find(l => l.indicator_id === ind.id);
      if (lim && lim.max_value != null) {
        limitLines.push({
          name: `${ind.name} 上限 ${lim.max_value}${ind.unit || ''}`,
          type: 'line',
          data: Array(dates.length).fill(lim.max_value),
          yAxisIndex: useDualAxis ? uniqueUnits.indexOf(ind.unit || '') : 0,
          lineStyle: { type: 'dashed', color: '#ff4d4f', width: 1.5 },
          itemStyle: { color: '#ff4d4f' },
          symbol: 'none',
          tooltip: { valueFormatter: (v: number) => `${v} ${ind.unit || ''}` },
        });
      }
      if (lim && lim.min_value != null) {
        limitLines.push({
          name: `${ind.name} 下限 ${lim.min_value}${ind.unit || ''}`,
          type: 'line',
          data: Array(dates.length).fill(lim.min_value),
          yAxisIndex: useDualAxis ? uniqueUnits.indexOf(ind.unit || '') : 0,
          lineStyle: { type: 'dashed', color: '#faad14', width: 1.5 },
          itemStyle: { color: '#faad14' },
          symbol: 'none',
        });
      }
    });

    series.push(...limitLines);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let html = `<strong>${params[0]?.axisValue || ''}</strong><br/>`;
          params.forEach((p: any) => {
            if (p.componentSubType === 'bar' || p.componentSubType === 'line') {
              const color = p.color || '#333';
              html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span>`;
              html += `${p.seriesName}: <strong>${p.value ?? '—'}</strong><br/>`;
            }
          });
          return html;
        },
      },
      legend: {
        type: 'scroll', bottom: 0,
        textStyle: { fontSize: 11 },
        pageTextStyle: { fontSize: 11 },
      },
      grid: { left: 70, right: useDualAxis ? 70 : 30, top: 40, bottom: 70 },
      dataZoom: [
        { type: 'slider', bottom: 30, height: 18, start: 0, end: 100 },
        { type: 'inside' },
      ],
      xAxis: { type: 'category', data: dates },
      yAxis: useDualAxis ? uniqueUnits.map((unit, idx) => ({
        type: 'value',
        name: unit,
        position: idx === 0 ? 'left' : 'right',
        axisLabel: { formatter: `{value}` },
      })) : { type: 'value', name: uniqueUnits[0] || '' },
      series,
    };
  };

  // ── Statistics ──
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const total = chartData.length;
    const qualified = chartData.filter(d => d.is_qualified === true).length;
    const failed = chartData.filter(d => d.is_qualified === false).length;
    const values = chartData.map(d => d.value_num).filter(v => v != null) as number[];
    const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '—';
    const max = values.length ? Math.max(...values).toFixed(2) : '—';
    const min = values.length ? Math.min(...values).toFixed(2) : '—';
    return { total, qualified, failed, avg, max, min, rate: total > 0 ? ((qualified / (qualified + failed)) * 100).toFixed(1) : '100.0' };
  }, [chartData]);

  // ── Data table ──
  const tableData = useMemo(() => {
    if (!chartData.length) return [];
    const rows: Record<string, any> = {};
    chartData.forEach(d => {
      const key = `${d.test_date}_${d.point_name}`;
      if (!rows[key]) { rows[key] = { key, test_date: d.test_date, point_name: d.point_name }; }
      rows[key][d.indicator_name] = { value: d.value_text || d.value_num || '—', ok: d.is_qualified };
    });
    return Object.values(rows);
  }, [chartData]);

  const tableColumns = useMemo(() => {
    const cols: any[] = [
      { title: '日期', dataIndex: 'test_date', width: 110, fixed: 'left' },
      { title: '采样点', dataIndex: 'point_name', width: 150, fixed: 'left', ellipsis: true },
    ];
    selectedInds.forEach(id => {
      const ind = indicators.find(i => i.id === id);
      if (ind) {
        cols.push({
          title: `${ind.name}${ind.unit ? ` (${ind.unit})` : ''}`,
          dataIndex: ind.name,
          width: 120,
          render: (v: any) => {
            if (!v) return '—';
            return (
              <Tooltip title={v.ok === false ? '超标' : v.ok === true ? '合格' : '—'}>
                <span style={{
                  color: v.ok === false ? '#ff4d4f' : v.ok === true ? '#52c41a' : '#94a3b8',
                  fontWeight: v.ok === false ? 600 : 400,
                }}>
                  {v.ok === false && <WarningOutlined style={{ marginRight: 4 }} />}
                  {v.value}
                </span>
              </Tooltip>
            );
          },
        });
      }
    });
    return cols;
  }, [selectedInds, indicators]);

  // ── Area groups for point selector ──
  const pointGroups = useMemo(() => {
    const areas = [...new Set(points.map(p => p.area))].filter(Boolean);
    return areas.map(area => ({
      label: area,
      options: points.filter(p => p.area === area).map(p => ({
        label: `${p.code} ${p.name}`,
        value: p.id,
      })),
    }));
  }, [points]);

  // ── Export chart as image ──
  const chartRef = { current: null as any };

  const handleExportImage = () => {
    if (chartRef.current) {
      const url = chartRef.current.getEchartsInstance().getDataURL({ type: 'png', pixelRatio: 2 });
      const a = document.createElement('a'); a.href = url; a.download = '趋势图.png'; a.click();
    }
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>趋势分析</Typography.Title>
          <Typography.Text type="secondary">水质指标变化趋势与异常分析</Typography.Text>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '12px 20px' }}>
        <Space wrap size="middle">
          <Select placeholder="水样类型" style={{ width: 150 }} value={selectedWt}
            onChange={v => { setSelectedWt(v); if (!v) return; }}
            options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
          />
          <Select mode="multiple" placeholder="选择指标" style={{ minWidth: 260 }} value={selectedInds}
            onChange={setSelectedInds} maxTagCount={3}
            options={indicators.map(i => ({
              label: `${i.name} (${i.unit || '-'})`,
              value: i.id,
            }))}
          />
          <Select mode="multiple" placeholder="请选择采样点" style={{ minWidth: 260 }} value={selectedPts}
            onChange={setSelectedPts} maxTagCount={2}
            options={pointGroups}
            dropdownRender={menu => (
              <>
                <div style={{ padding: '4px 12px', display: 'flex', gap: 8 }}>
                  <Button size="small" type="link" onClick={() => setSelectedPts(points.map(p => p.id))}>全选</Button>
                  <Button size="small" type="link" onClick={() => setSelectedPts([])}>清空</Button>
                </div>
                <Divider style={{ margin: '4px 0' }} />
                {menu}
              </>
            )}
          />
          <Space size={4}>
            <Button size="small" type="default" onClick={() => {
              const d = dayjs();
              setStartDate(d.format('YYYY-MM-DD'));
              setEndDate(d.format('YYYY-MM-DD'));
            }}>今天</Button>
            <Button size="small" type="default" onClick={() => {
              setStartDate(dayjs().subtract(6, 'day').format('YYYY-MM-DD'));
              setEndDate(dayjs().format('YYYY-MM-DD'));
            }}>近7天</Button>
            <Button size="small" type="default" onClick={() => {
              setStartDate(dayjs().subtract(29, 'day').format('YYYY-MM-DD'));
              setEndDate(dayjs().format('YYYY-MM-DD'));
            }}>近30天</Button>
          </Space>
          <DatePicker value={startDate ? dayjs(startDate) : null}
            onChange={d => setStartDate(d?.format('YYYY-MM-DD') || '')} placeholder="开始" />
          <DatePicker value={endDate ? dayjs(endDate) : null}
            onChange={d => setEndDate(d?.format('YYYY-MM-DD') || '')} placeholder="结束" />
          <Button type="primary" icon={<LineChartOutlined />} onClick={handleQuery} loading={loading}>查询</Button>
          <Button icon={<ClearOutlined />} onClick={() => {
            setSelectedInds([]); setSelectedPts([]); setChartData([]);
            setStartDate(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
            setEndDate(dayjs().format('YYYY-MM-DD'));
          }}>重置</Button>
        </Space>
      </Card>

      {/* ── Statistics Cards ── */}
      {stats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="数据量" value={stats.total} suffix="条" valueStyle={{ fontSize: 22, color: '#0891b2' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="合格率" value={stats.rate} suffix="%" valueStyle={{ fontSize: 22, color: stats.failed > 0 ? '#faad14' : '#52c41a' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="异常点数" value={stats.failed} suffix="个" valueStyle={{ fontSize: 22, color: stats.failed > 0 ? '#ff4d4f' : '#52c41a' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="平均值" value={stats.avg} valueStyle={{ fontSize: 22 }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="最大值" value={stats.max} valueStyle={{ fontSize: 22, color: '#0e7490' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
              <Statistic title="最小值" value={stats.min} valueStyle={{ fontSize: 22, color: '#0891b2' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* ── Chart ── */}
      {loading ? <Spin style={{ display: 'block', margin: '60px auto' }} /> :
        chartData.length > 0 ? (
          <Card style={{ borderRadius: 12, marginBottom: 16 }}
            title={
              <Space>
                <span>趋势图</span>
                <Radio.Group value={chartType} onChange={e => setChartType(e.target.value)} size="small" optionType="button">
                  <Radio.Button value="line"><LineChartOutlined /> 折线</Radio.Button>
                  <Radio.Button value="bar"><BarChartOutlined /> 柱状</Radio.Button>
                </Radio.Group>
              </Space>
            }
            extra={
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExportImage}>导出图片</Button>
            }
          >
            <ReactECharts
              ref={chartRef}
              option={getChartOption()}
              style={{ height: 480 }}
              notMerge
            />
          </Card>
        ) : (
          !selectedWt ? <Empty description="请先选择水样类型" /> :
          !selectedInds.length ? <Empty description="请选择至少一个指标" /> :
          !selectedPts.length ? <Empty description="请选择至少一个采样点"><Button size="small" onClick={() => setSelectedPts(points.map(p => p.id))}>一键全选</Button></Empty> :
          <Empty description="点击「查询」查看趋势数据" />
        )}

      {/* ── Data Table ── */}
      {tableData.length > 0 && (
        <Card title="数据明细" style={{ borderRadius: 12 }} bodyStyle={{ padding: '0 24px 24px' }}>
          <Table
            columns={tableColumns}
            dataSource={tableData}
            size="small"
            scroll={{ x: 200 + selectedInds.length * 120 }}
            pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }}
          />
        </Card>
      )}

      <style>{`
        .row-rejected td { background: #fffbe6 !important; }
        .row-rejected:hover td { background: #fff7cc !important; }
      `}</style>
    </div>
  );
}
