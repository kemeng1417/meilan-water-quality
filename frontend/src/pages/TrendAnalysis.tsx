import { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Button, Space, Typography, Spin, Empty } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { getIndicators, getSamplePoints, getWaterTypes, getTrendData } from '../api/endpoints';

export default function TrendAnalysis() {
  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string }[]>([]);
  const [indicators, setIndicators] = useState<{ id: number; name: string; unit: string | null; value_type: string }[]>([]);
  const [points, setPoints] = useState<{ id: number; name: string; code: string }[]>([]);
  const [selectedWt, setSelectedWt] = useState<number | undefined>();
  const [selectedInds, setSelectedInds] = useState<number[]>([]);
  const [selectedPts, setSelectedPts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getWaterTypes().then(res => setWaterTypes(res.data));
  }, []);

  useEffect(() => {
    if (selectedWt) {
      getIndicators(selectedWt).then(res => setIndicators(res.data));
      getSamplePoints(selectedWt).then(res => setPoints(res.data));
    }
  }, [selectedWt]);

  const handleQuery = async () => {
    if (!selectedInds.length) { return; }
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        indicator_ids: selectedInds.join(','),
        start_date: startDate,
        end_date: endDate,
      };
      if (selectedPts.length) params.sampling_point_ids = selectedPts.join(',');
      const res = await getTrendData(params);
      setChartData(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  };

  const getChartOption = () => {
    if (!chartData.length) return {};

    const dates = [...new Set(chartData.map(d => d.test_date))].sort();
    const firstInd = indicators.find(i => i.id === selectedInds[0]);
    const unit = firstInd?.unit || '';

    // Group by point + indicator
    const seriesMap = new Map<string, { point: string; ind: string; data: (number | null)[] }>();
    chartData.forEach(d => {
      const key = `${d.point_name} - ${d.indicator_name}`;
      if (!seriesMap.has(key)) {
        seriesMap.set(key, { point: d.point_name, ind: d.indicator_name, data: Array(dates.length).fill(null) });
      }
      const idx = dates.indexOf(d.test_date);
      if (idx >= 0) {
        seriesMap.get(key)!.data[idx] = d.value_num;
      }
    });

    const limitLine = getLimitLine(selectedWt || 0, selectedInds[0]);

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { type: 'scroll' as const, bottom: 0 },
      grid: { left: 60, right: 30, top: 40, bottom: 60 },
      xAxis: { type: 'category' as const, data: dates },
      yAxis: {
        type: 'value' as const,
        name: unit,
        ...(limitLine ? { min: Math.min(limitLine - 1, 0), max: limitLine * 1.5 } : {}),
      },
      series: [
        ...Array.from(seriesMap.values()).map(s => ({
          name: s.point,
          type: 'line' as const,
          data: s.data,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
        })),
        ...(limitLine ? [{
          name: `标准限值 (${limitLine}${unit})`,
          type: 'line' as const,
          data: Array(dates.length).fill(limitLine),
          lineStyle: { type: 'dashed' as const, color: '#ff4d4f' },
          itemStyle: { color: '#ff4d4f' },
          symbol: 'none' as const,
        }] : []),
      ],
    };
  };

  const getLimitLine = (wtId: number, indId: number): number | null => {
    // Standard limits for common indicators
    if (indId === 2) return wtId === 3 ? 0.5 : 1.0; // 浑浊度
    if (indId === 3) return wtId === 3 ? 5 : 15; // 色度
    if (indId === 5) return wtId === 3 ? 2 : 3; // COD
    if (indId === 6) return wtId === 3 ? 50 : 100; // 菌落总数
    return null;
  };

  return (
    <div>
      <Typography.Title level={4}>趋势分析</Typography.Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>水样类型：</span>
          <Select placeholder="选择类型" style={{ width: 160 }} value={selectedWt}
            onChange={v => { setSelectedWt(v); setSelectedInds([]); setSelectedPts([]); setChartData([]); }}
            options={waterTypes.map(w => ({ label: w.name, value: w.id }))}
          />
          <span>指标：</span>
          <Select mode="multiple" placeholder="选择指标" style={{ minWidth: 250 }} value={selectedInds}
            onChange={setSelectedInds}
            options={indicators.filter(i => i.value_type === 'numeric').map(i => ({ label: `${i.name} (${i.unit || '-'})`, value: i.id }))}
          />
          <span>采样点：</span>
          <Select mode="multiple" placeholder="全部采样点" style={{ minWidth: 250 }} value={selectedPts}
            onChange={setSelectedPts} maxTagCount={2}
            options={points.map(p => ({ label: `${p.code} ${p.name}`, value: p.id }))}
          />
          <DatePicker placeholder="开始" value={startDate ? dayjs(startDate) : null}
            onChange={d => setStartDate(d?.format('YYYY-MM-DD') || '')} />
          <DatePicker placeholder="结束" value={endDate ? dayjs(endDate) : null}
            onChange={d => setEndDate(d?.format('YYYY-MM-DD') || '')} />
          <Button type="primary" icon={<LineChartOutlined />} onClick={handleQuery} loading={loading}>查询</Button>
        </Space>
      </Card>

      {loading ? <Spin style={{ display: 'block', margin: '60px auto' }} /> :
        chartData.length > 0 ? (
          <Card><ReactECharts option={getChartOption()} style={{ height: 500 }} /></Card>
        ) : (
          selectedWt ? <Empty description="请选择指标并点击查询" /> : <Empty description="请先选择水样类型" />
        )}
    </div>
  );
}
