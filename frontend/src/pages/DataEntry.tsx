import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  Card, Select, DatePicker, Input, Button, Table, message,
  Space, Typography, Tag, Descriptions, Popconfirm, Tooltip, Divider,
  Breadcrumb, Progress, Dropdown, Checkbox, Tabs, Modal, Radio,
} from 'antd';
import {
  SaveOutlined, SendOutlined, DownloadOutlined,
  PlusOutlined, ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined, UserOutlined, ThunderboltOutlined,
  HomeOutlined, CopyOutlined, SwapOutlined,
  TableOutlined, UnorderedListOutlined, InfoCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
  CameraOutlined, PictureOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getWaterTypes, getIndicators, getLimits,
  createRecord, getRecord, getDetails, saveDetails, reviewRecord, updateRecord,
  exportWord, exportExcel, exportHtml, exportPdf, getLatestData, rejectRecord,
  getSamplePoints, uploadPhoto, getPhotos, deletePhoto,
} from '../api/endpoints';
import { AREA_COLORS, STATUS_MAP } from '../theme/tokens';

interface Indicator {
  id: number; name: string; unit: string | null; value_type: string; display_order: number;
}

interface DetailRow {
  id: number; sample_point_id: number; sample_point_name: string;
  sample_point_code: string; sample_point_area: string;
  indicator_id: number; indicator_name: string; indicator_unit: string | null;
  indicator_type: string; value_text: string | null; value_num: number | null;
  is_qualified: boolean | null; is_abnormal: boolean;
}

interface LimitInfo {
  indicator_id: number; min_value: number | null; max_value: number | null;
  qual_check: string | null; remark: string | null;
}

const LS_LAST_WT = 'water_last_water_type';
const LS_LAST_POINTS = 'water_last_points';

export default function DataEntry() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const recordId = params.id || searchParams.get('id');
  const presetWt = searchParams.get('wt');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [waterTypes, setWaterTypes] = useState<{ id: number; name: string; code: string; standard_code: string }[]>([]);
  const [selectedWt, setSelectedWt] = useState<number | null>(
    recordId ? null : (presetWt ? parseInt(presetWt) : parseInt(localStorage.getItem(LS_LAST_WT) || '') || null)
  );
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [limits, setLimits] = useState<LimitInfo[]>([]);
  const [availablePoints, setAvailablePoints] = useState<any[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>([]);
  const [record, setRecord] = useState<any>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tester, setTester] = useState(user.display_name || '');
  const [testDate, setTestDate] = useState<dayjs.Dayjs>(dayjs());
  const [conclusion, setConclusion] = useState('');
  const [reviewer, setReviewer] = useState('');

  // New UX state
  const [viewMode, setViewMode] = useState<'matrix' | 'single'>('matrix');
  const [activeArea, setActiveArea] = useState<string>('all');
  const [singlePointId, setSinglePointId] = useState<number | null>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [photos, setPhotos] = useState<Record<number, any[]>>({});
  const [abnormalExpanded, setAbnormalExpanded] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');
  const [lastSaved, setLastSaved] = useState<string>('');
  const [hasLatestData, setHasLatestData] = useState(false);
  const [recordInfoExpanded, setRecordInfoExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const undoStack = useRef<DetailRow[][]>([]);
  const redoStack = useRef<DetailRow[][]>([]);
  const isComposingRef = useRef(false);
  const [changedCells, setChangedCells] = useState<Set<string>>(new Set());

  // ── Data Loading ──
  useEffect(() => { getWaterTypes().then(res => setWaterTypes(res.data)); }, []);

  useEffect(() => {
    if (!selectedWt) return;
    getIndicators(selectedWt).then(res => setIndicators(res.data));
    getLimits(selectedWt).then(res => setLimits(res.data));
    getSamplePoints(selectedWt).then(res => {
      setAvailablePoints(res.data);
      if (!recordId) {
        const saved = localStorage.getItem(`${LS_LAST_POINTS}_${selectedWt}`);
        setSelectedPointIds(saved ? JSON.parse(saved) : res.data.map((p: any) => p.id));
      }
    });
  }, [selectedWt]);

  useEffect(() => {
    if (!recordId) return;
    const id = parseInt(recordId);
    getRecord(id).then(res => {
      setRecord(res.data); setSelectedWt(res.data.water_type_id);
      setTester(res.data.tester); setTestDate(dayjs(res.data.test_date));
      setConclusion(res.data.conclusion || ''); setReviewer(res.data.reviewer || '');
    });
    getDetails(id).then(res => {
      setDetails(res.data);
      if (!singlePointId) {
        const pts = [...new Set(res.data.map((d: DetailRow) => d.sample_point_id))];
        if (pts.length > 0) setSinglePointId(pts[0] as number);
      }
    });
  }, [recordId]);

  // ── Auto-save ──
  useEffect(() => {
    if (!record || record.status !== 'draft') return;
    autoSaveTimer.current = setInterval(() => {
      if (autoSaveStatus === 'unsaved') performSave(true);
    }, 60000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [record, autoSaveStatus]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (autoSaveStatus === 'unsaved') {
        e.preventDefault();
        e.returnValue = '有未保存的数据，确定离开吗？';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [autoSaveStatus]);

  // ── Keyboard shortcuts (Ctrl+Z undo, Ctrl+Y redo, ESC fullscreen) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isComposingRef.current) return; // Skip shortcuts during IME composition
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.current.length > 0) {
          redoStack.current.push(details);
          setDetails(undoStack.current.pop()!);
          setAutoSaveStatus('unsaved');
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (redoStack.current.length > 0) {
          undoStack.current.push(details);
          setDetails(redoStack.current.pop()!);
          setAutoSaveStatus('unsaved');
        }
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [details, isFullscreen]);
  useEffect(() => {
    if (selectedWt) localStorage.setItem(LS_LAST_WT, String(selectedWt));
    if (selectedWt && selectedPointIds.length > 0) {
      localStorage.setItem(`${LS_LAST_POINTS}_${selectedWt}`, JSON.stringify(selectedPointIds));
    }
  }, [selectedWt, selectedPointIds]);

  // ── Record CRUD ──
  const handleCreate = async () => {
    if (!selectedWt) { message.warning('请选择水样类型'); return; }
    if (!tester) { message.warning('请输入化验员'); return; }
    setLoading(true);
    try {
      const res = await createRecord({
        water_type_id: selectedWt,
        test_date: testDate.format('YYYY-MM-DD'),
        tester,
        point_ids: selectedPointIds.length > 0 ? selectedPointIds : undefined,
      });
      const rec = res.data;
      setRecord(rec);
      const detRes = await getDetails(rec.id);
      setDetails(detRes.data);
      const pts = [...new Set(detRes.data.map((d: DetailRow) => d.sample_point_id))];
      if (pts.length > 0) setSinglePointId(Number(pts[0]));
      message.success(`报告 ${rec.record_no} 已创建`);
      navigate(`/records/${rec.id}`, { replace: true });
    } catch { message.error('创建失败'); }
    finally { setLoading(false); }
  };

  const handleCopyLast = async () => {
    if (!selectedWt || !record) return;
    try {
      const res = await getLatestData(selectedWt);
      if (!res.data.found) { message.info('没有找到历史数据'); return; }
      setDetails(prev => {
        const updated = [...prev];
        for (const item of res.data.items) {
          const idx = updated.findIndex(
            d => d.sample_point_id === item.sample_point_id && d.indicator_id === item.indicator_id
          );
          if (idx >= 0 && item.value_text) updated[idx] = { ...updated[idx], value_text: item.value_text };
        }
        return updated;
      });
      setAutoSaveStatus('unsaved');
      message.success(`已从 ${res.data.record_no} (${res.data.test_date}) 复制数据`);
    } catch { message.error('复制失败'); }
  };

  const handleReject = async () => {
    if (!record) return;
    const reason = prompt('请输入打回原因：');
    if (!reason) return;
    try {
      await rejectRecord(record.id, user.display_name, reason);
      message.success('已打回');
      navigate('/records');
    } catch { message.error('操作失败'); }
  };

  // ── Photos ──
  const loadPhotos = async () => {
    if (!record) return;
    try {
      const res = await getPhotos(record.id);
      const map: Record<number, any[]> = {};
      for (const p of res.data) {
        if (!map[p.sample_point_id]) map[p.sample_point_id] = [];
        map[p.sample_point_id].push(p);
      }
      setPhotos(map);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (record) {
      loadPhotos();
      // Check if there's historical data for copy-last
      getLatestData(record.water_type_id).then(res => setHasLatestData(res.data.found));
    }
  }, [record?.id]);

  const handleUploadPhoto = async (samplePointId: number) => {
    if (!fileInputRef.current) {
      fileInputRef.current = document.createElement('input');
      fileInputRef.current.type = 'file';
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.multiple = true;
    }
    const input = fileInputRef.current;
    input.onchange = async () => {
      if (!input.files || !record) return;
      const files = Array.from(input.files);
      for (let i = 0; i < files.length; i++) {
        try {
          message.loading({ content: `上传照片 ${i + 1}/${files.length}...`, key: 'upload', duration: 0 });
          await uploadPhoto(record.id, samplePointId, files[i]);
        } catch { message.error({ content: `照片 ${i + 1} 上传失败`, key: 'upload' }); }
      }
      message.success({ content: `已上传 ${files.length} 张照片`, key: 'upload' });
      loadPhotos();
      input.value = '';
    };
    input.click();
  };

  const handleDeletePhoto = async (photoId: number) => {
    try {
      await deletePhoto(photoId);
      loadPhotos();
    } catch { message.error('删除失败'); }
  };

  const updateCell = (samplePointId: number, indicatorId: number, value: string) => {
    if (isComposingRef.current) return; // Skip during IME composition
    setDetails(prev => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      return prev.map(d =>
        d.sample_point_id === samplePointId && d.indicator_id === indicatorId
          ? { ...d, value_text: value } : d
      );
    });
    setAutoSaveStatus('unsaved');
  };

  const performSave = async (isAutoSave = false) => {
    if (!record) return;
    setSaving(true);
    if (!isAutoSave) setAutoSaveStatus('saving');
    try {
      const items = details
        .filter(d => d.value_text != null && d.value_text !== '')
        .map(d => ({ sample_point_id: d.sample_point_id, indicator_id: d.indicator_id, value_text: d.value_text || '' }));
      const res = await saveDetails(record.id, items);
      const detRes = await getDetails(record.id);
      setDetails(detRes.data);
      setLastSaved(dayjs().format('HH:mm:ss'));
      setAutoSaveStatus('saved');
      if (!isAutoSave) {
        message[res.data.has_abnormal ? 'warning' : 'success'](
          res.data.has_abnormal ? '保存成功，检测到超标项目！' : '保存成功'
        );
      }
    } catch {
      setAutoSaveStatus('unsaved');
      if (!isAutoSave) message.error('保存失败');
    } finally { setSaving(false); }
  };

  const handleSave = async () => {
    await performSave(false);
    if (record) {
      try { await updateRecord(record.id, { conclusion }); } catch { /* silent */ }
    }
  };

  const handleSubmit = async () => {
    if (!record) return;
    await performSave(false);
    try {
      await updateRecord(record.id, { status: 'submitted', conclusion });
      setRecord((prev: any) => ({ ...prev, status: 'submitted' }));
      message.success('已提交审核');
    } catch { message.error('提交失败'); }
  };

  const handleReview = async () => {
    if (!record) return;
    try {
      await reviewRecord(record.id, reviewer || user.display_name, conclusion);
      message.success('审核完成');
      navigate('/records');
    } catch { message.error('审核失败'); }
  };

  const handleExport = async (type: 'word' | 'excel' | 'html' | 'pdf') => {
    if (!record) return;
    try {
      const fnMap = { word: exportWord, excel: exportExcel, html: exportHtml, pdf: exportPdf };
      const extMap = { word: 'docx', excel: 'xlsx', html: 'html', pdf: 'pdf' };
      const fn = fnMap[type];
      const res = await fn(record.id);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `${record.record_no}.${extMap[type]}`;
      a.click(); URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch { message.error('导出失败'); }
  };

  // ── Batch Paste ──
  const handleBatchPaste = () => {
    const rows = pasteText.trim().split('\n').map(line => line.split('\t'));
    if (rows.length === 0) { message.warning('无有效数据'); return; }

    const visiblePoints = getVisiblePoints();
    const pointIds = visiblePoints.map(p => p.sample_point_id);
    const highlighted = new Set<string>();

    setDetails(prev => {
      undoStack.current.push(prev);
      redoStack.current = [];
      const updated = [...prev];
      for (let r = 0; r < Math.min(rows.length, pointIds.length); r++) {
        const spId = pointIds[r];
        for (let c = 0; c < Math.min(rows[r].length, indicators.length); c++) {
          const indId = indicators[c].id;
          const val = rows[r][c].trim();
          if (val) {
            const idx = updated.findIndex(d => d.sample_point_id === spId && d.indicator_id === indId);
            if (idx >= 0) { updated[idx] = { ...updated[idx], value_text: val }; highlighted.add(`${spId}_${indId}`); }
          }
        }
      }
      return updated;
    });
    setChangedCells(highlighted);
    setTimeout(() => setChangedCells(new Set()), 3000);
    setAutoSaveStatus('unsaved');
    setPasteModalOpen(false);
    setPasteText('');
    message.success(`已粘贴 ${Math.min(rows.length, pointIds.length)} 行数据`);
  };

  // ── Quick-fill ──
  const handleQuickFill = (indicatorName: string, value: string) => {
    const ind = indicators.find(i => i.name === indicatorName);
    if (!ind) return;
    setDetails(prev => prev.map(d =>
      d.indicator_id === ind.id ? { ...d, value_text: value } : d
    ));
    setAutoSaveStatus('unsaved');
  };

  const handleQuickFillColumn = (indicatorId: number, value: string) => {
    const visiblePtIds = new Set(getVisiblePoints().map(p => p.sample_point_id));
    setDetails(prev => {
      undoStack.current.push(prev);
      redoStack.current = [];
      return prev.map(d =>
        d.indicator_id === indicatorId && visiblePtIds.has(d.sample_point_id)
          ? { ...d, value_text: value } : d
      );
    });
    setAutoSaveStatus('unsaved');
  };

  // ── Keyboard navigation ──
  const handleCellKeyDown = (e: React.KeyboardEvent, samplePointId: number, indicatorId: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const allCells = document.querySelectorAll<HTMLInputElement>('[data-cell-input]');
      const currentIdx = Array.from(allCells).findIndex(
        el => el.dataset.spId === String(samplePointId) && el.dataset.indId === String(indicatorId)
      );
      const nextIdx = currentIdx + dir;
      if (nextIdx >= 0 && nextIdx < allCells.length) {
        (allCells[nextIdx] as HTMLInputElement).focus();
        (allCells[nextIdx] as HTMLInputElement).select();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const allCells = Array.from(document.querySelectorAll<HTMLInputElement>('[data-cell-input]'));
      const sameColCells = allCells.filter(el => el.dataset.indId === String(indicatorId));
      const currentIdx = sameColCells.findIndex(el => el.dataset.spId === String(samplePointId));
      const nextCell = sameColCells[currentIdx + 1];
      if (nextCell) { nextCell.focus(); nextCell.select(); }
      // In single-point mode, Enter at last row jumps to next point
      if (!nextCell && viewMode === 'single') {
        const visiblePoints = getVisiblePoints();
        const ptIdx = visiblePoints.findIndex(p => p.sample_point_id === samplePointId);
        if (ptIdx >= 0 && ptIdx < visiblePoints.length - 1) {
          setSinglePointId(visiblePoints[ptIdx + 1].sample_point_id);
          setTimeout(() => {
            const firstInput = document.querySelector<HTMLInputElement>('[data-cell-input]');
            if (firstInput) { firstInput.focus(); firstInput.select(); }
          }, 100);
        }
      }
    }
  };

  // ── Helpers ──
  const getLimitText = (indicatorId: number): string => {
    const lim = limits.find(l => l.indicator_id === indicatorId);
    if (!lim) return '';
    if (lim.qual_check) return lim.qual_check;
    if (lim.min_value != null && lim.max_value != null) return `${lim.min_value}~${lim.max_value}`;
    if (lim.max_value != null) return `≤${lim.max_value}`;
    if (lim.min_value != null) return `≥${lim.min_value}`;
    return '';
  };

  const grouped = details.reduce<Record<number, DetailRow[]>>((acc, d) => {
    if (!acc[d.sample_point_id]) acc[d.sample_point_id] = [];
    acc[d.sample_point_id].push(d);
    return acc;
  }, {});

  const allPoints = Object.entries(grouped).map(([spId, items]) => ({
    sample_point_id: parseInt(spId),
    sample_point_name: items[0]?.sample_point_name || '',
    sample_point_code: items[0]?.sample_point_code || '',
    sample_point_area: items[0]?.sample_point_area || '',
  }));

  // Unique areas
  const areas = useMemo(() => [...new Set(allPoints.map(p => p.sample_point_area))].filter(Boolean), [allPoints]);

  const getVisiblePoints = () => {
    if (viewMode === 'single' && singlePointId) {
      return allPoints.filter(p => p.sample_point_id === singlePointId);
    }
    return activeArea === 'all' ? allPoints : allPoints.filter(p => p.sample_point_area === activeArea);
  };

  // Row status: all-filled / partial / empty / has-abnormal
  const getRowStatus = (spId: number) => {
    const rowDets = details.filter(d => d.sample_point_id === spId);
    const filled = rowDets.filter(d => d.value_text && d.value_text.trim());
    const abnormal = rowDets.some(d => d.is_abnormal);
    if (abnormal) return 'abnormal';
    if (filled.length === 0) return 'empty';
    if (filled.length === rowDets.length) return 'complete';
    return 'partial';
  };

  const rowStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />;
      case 'partial': return <span style={{ color: '#faad14', fontSize: 12, fontWeight: 600 }}>◐</span>;
      case 'abnormal': return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />;
      default: return <span style={{ color: '#d9d9d9', fontSize: 12 }}>○</span>;
    }
  };

  // ── Table columns ──
  const indicatorColumns = indicators.map(ind => ({
    title: (
      <Tooltip title={`标准: ${getLimitText(ind.id)}`} placement="top">
        <div style={{ textAlign: 'center', cursor: 'pointer' }}
          onClick={() => handleQuickFillColumn(ind.id, ind.value_type === 'text' ? (ind.name === '肉眼可见物' ? '无' : ind.name === '总大肠菌群' ? '未检出' : ind.name === '臭和味' ? '无异臭、异味' : '') : '合格')}>
          <div style={{ fontWeight: 600, fontSize: isFullscreen ? 15 : 13 }}>{ind.name}</div>
          {ind.unit && <div style={{ fontSize: isFullscreen ? 12 : 11, color: '#94a3b8' }}>({ind.unit})</div>}
        </div>
      </Tooltip>
    ),
    dataIndex: `ind_${ind.id}`,
    key: `ind_${ind.id}`,
    width: ind.value_type === 'text' ? 120 : 110,
    render: (_: any, row: any) => {
      // Standard limit reference row
      if (row.sample_point_id === -1) {
        return (
          <div style={{ textAlign: 'center', fontSize: isFullscreen ? 13 : 12, color: '#64748b', fontStyle: 'italic', padding: '0 4px' }}>
            {getLimitText(ind.id)}
          </div>
        );
      }

      const detail = details.find(d => d.sample_point_id === row.sample_point_id && d.indicator_id === ind.id);
      const isEditable = !record || record.status === 'draft' || record.status === 'rejected';
      const isFail = detail?.is_qualified === false;

      if (!isEditable) {
        const val = detail?.value_text;
        return (
          <div style={{
            padding: '2px 6px', textAlign: 'center', borderRadius: 6, minHeight: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            background: isFail ? '#fff2f0' : detail?.is_qualified === true ? '#f6ffed' : 'transparent',
            border: isFail ? '1px solid #ffccc7' : detail?.is_qualified === true ? '1px solid #b7eb8f' : '1px solid transparent',
          }}>
            {isFail ? <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} /> :
             detail?.is_qualified === true ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} /> : null}
            <span style={{ color: isFail ? '#cf1322' : '#334155', fontWeight: isFail ? 600 : 400, fontSize: isFullscreen ? 16 : 14 }}>
              {val || '—'}
            </span>
          </div>
        );
      }

      // Cell-change highlight (from paste)
      const cellKey = `${row.sample_point_id}_${ind.id}`;
      const justChanged = changedCells.has(cellKey);

      // Input validation
      const lim = limits.find(l => l.indicator_id === ind.id);
      let validationError = false;
      if (detail?.value_text && lim && lim.max_value != null) {
        const numVal = parseFloat(detail.value_text);
        if (!isNaN(numVal) && numVal > lim.max_value * 2) validationError = true;
        if (!isNaN(numVal) && lim.min_value != null && numVal < 0) validationError = true;
      }

      return (
        <Input
          size="small"
          value={detail?.value_text || ''}
          onChange={e => updateCell(row.sample_point_id, ind.id, e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => handleCellKeyDown(e, row.sample_point_id, ind.id)}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={(e: any) => {
            isComposingRef.current = false;
            // Commit the final composed value
            updateCell(row.sample_point_id, ind.id, e.target.value);
          }}
          {...{ 'data-cell-input': '', 'data-sp-id': String(row.sample_point_id), 'data-ind-id': String(ind.id) } as any}
          style={{
            textAlign: 'center', borderRadius: 4, height: isFullscreen ? 40 : 36,
            borderColor: validationError ? '#faad14' : isFail ? '#ff4d4f' : detail?.is_qualified === true ? '#b7eb8f' : '#d9d9d9',
            background: justChanged ? '#e6f7ff' : isFail ? '#fff2f0' : detail?.is_qualified === true ? '#f6ffed' : '#fff',
            fontSize: isFullscreen ? 16 : 14,
            boxShadow: justChanged ? '0 0 0 2px #1890ff' : (validationError ? '0 0 0 2px #faad14' : undefined),
            transition: 'all 0.3s ease',
          }}
          placeholder={ind.unit || ''}
        />
      );
    },
  }));

  const visiblePoints = getVisiblePoints();
  const columns = [
    {
      title: '', width: 32, align: 'center' as const, fixed: 'left' as const,
      render: (_: any, r: any) => rowStatusIcon(getRowStatus(r.sample_point_id)),
    },
    {
      title: '#', width: 40, align: 'center' as const, fixed: 'left' as const,
      render: (_: any, __: any, i: number) => (
        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{i + 1}</span>
      ),
    },
    {
      title: '区域', dataIndex: 'sample_point_area', width: 95, fixed: 'left' as const,
      render: (v: string) => <Tag color={AREA_COLORS[v] || 'default'} style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>{v}</Tag>,
    },
    {
      title: '采样点', dataIndex: 'sample_point_name', width: 180, ellipsis: true, fixed: 'left' as const,
      render: (v: string) => <span style={{ fontSize: isFullscreen ? 16 : 14, fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '编号', dataIndex: 'sample_point_code', width: 105, fixed: 'left' as const,
      render: (v: string) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text>,
    },
    ...indicatorColumns,
  ];

  // ── Standard limit reference row (inserted as first data row) ──
  const limitRow = {
    key: '__limit_row__',
    sample_point_id: -1,
    sample_point_name: '标准限值',
    sample_point_code: '',
    sample_point_area: '',
    ...Object.fromEntries(indicators.map(ind => [`ind_${ind.id}`, getLimitText(ind.id)])),
  };

  // ── Stats ──
  const isDraft = record?.status === 'draft';
  const isRejected = record?.status === 'rejected';
  const isEditable = isDraft || isRejected;
  // Anyone can review — just enter name and click
  const abnormalItems = details.filter(d => d.is_abnormal);
  const filledCells = details.filter(d => d.value_text && d.value_text.trim()).length;
  const completedPoints = allPoints.filter(p => getRowStatus(p.sample_point_id) === 'complete').length;
  const totalPoints = allPoints.length;

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb style={{ marginBottom: 12 }} items={[
        { title: <><HomeOutlined /> 首页</>, onClick: () => navigate('/') },
        { title: '检测记录', onClick: () => navigate('/records') },
        { title: record ? record.record_no : '新建报告' },
      ]} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            {record ? record.record_no : '新建水质检测报告'}
          </Typography.Title>
          {record && (
            <Space style={{ marginTop: 4 }}>
              <Tag color={waterTypes.find(w => w.id === record.water_type_id)?.code === 'direct' ? 'cyan' : 'blue'} style={{ borderRadius: 6 }}>
                {waterTypes.find(w => w.id === record.water_type_id)?.name}
              </Tag>
              <Typography.Text type="secondary">{record.test_date}</Typography.Text>
              <Tag color={STATUS_MAP[record.status]?.color} style={{ borderRadius: 6 }}>
                {STATUS_MAP[record.status]?.label || record.status}
              </Tag>
              {record.status === 'rejected' && record.rejection_reason && (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>原因: {record.rejection_reason}</Typography.Text>
              )}
              {autoSaveStatus === 'saving' && <Tag color="processing" style={{ borderRadius: 6 }}>保存中...</Tag>}
              {autoSaveStatus === 'saved' && <Tag color="success" style={{ borderRadius: 6 }}>已保存 {lastSaved}</Tag>}
              {autoSaveStatus === 'unsaved' && <Tag color="warning" style={{ borderRadius: 6 }}>未保存</Tag>}
            </Space>
          )}
        </div>

        {record && (
          <Space wrap>
            {isEditable && (
              <>
                <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ borderRadius: 8 }}>保存</Button>
                <Tooltip title={hasLatestData ? '复制最近一次同类型报告数据' : '暂无历史数据'}><Button icon={<CopyOutlined />} onClick={handleCopyLast} disabled={!hasLatestData} style={{ borderRadius: 8 }}>复制上日</Button></Tooltip>
                <Button icon={<SwapOutlined />} onClick={() => setPasteModalOpen(true)} style={{ borderRadius: 8 }}>批量粘贴</Button>
                <Popconfirm title="提交后将无法修改，确认提交？" onConfirm={handleSubmit} okText="确认提交" cancelText="取消">
                  <Button type="primary" icon={<SendOutlined />} style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none' }}>提交审核</Button>
                </Popconfirm>
              </>
            )}
            {record?.status === 'rejected' && (
              <Popconfirm title="重新提交审核？" onConfirm={handleSubmit} okText="确认" cancelText="取消">
                <Button type="primary" icon={<SendOutlined />} style={{ borderRadius: 8 }}>重新提交</Button>
              </Popconfirm>
            )}
            {/* Review — anyone can review submitted records */}
            {(record?.status === 'submitted' || record?.status === 'rejected') && (
              <>
                <Divider type="vertical" />
                <Input placeholder="审核人姓名" value={reviewer} onChange={e => setReviewer(e.target.value)} style={{ width: 120, borderRadius: 8 }} />
                <Button type="primary" onClick={handleReview} icon={<CheckCircleOutlined />} style={{ borderRadius: 8, background: '#52c41a', borderColor: '#52c41a' }}>审核通过</Button>
                {record?.status === 'submitted' && (
                  <Button danger onClick={handleReject} style={{ borderRadius: 8 }}>打回修改</Button>
                )}
              </>
            )}
            <Dropdown menu={{
              items: [
                { key: 'excel', label: '导出 Excel (.xlsx)', icon: <DownloadOutlined /> },
                { key: 'word', label: '导出 Word (.docx)', icon: <DownloadOutlined /> },
                { key: 'html', label: '导出 HTML (.html)', icon: <DownloadOutlined /> },
                { key: 'pdf', label: '导出 PDF (.pdf)', icon: <DownloadOutlined /> },
              ],
              onClick: ({ key }) => handleExport(key as 'word' | 'excel' | 'html' | 'pdf'),
            }}>
              <Button icon={<DownloadOutlined />} style={{ borderRadius: 8 }}>导出报告</Button>
            </Dropdown>
          </Space>
        )}
      </div>

      {/* New Record Config */}
      {!record && (
        <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Select placeholder="选择水样类型" style={{ width: 260 }} size="large" value={selectedWt}
              onChange={setSelectedWt}
              options={waterTypes.map(wt => ({ label: `${wt.name} — ${wt.standard_code}`, value: wt.id }))}
            />
            <Space size={4}>
              <DatePicker size="large" value={testDate} onChange={d => setTestDate(d || dayjs())} style={{ borderRadius: 8 }} />
              <Button size="small" onClick={() => setTestDate(dayjs().subtract(1, 'day'))}>昨天</Button>
              <Button size="small" onClick={() => setTestDate(dayjs())}>今天</Button>
            </Space>
            <Input size="large" placeholder="化验员" value={tester} onChange={e => setTester(e.target.value)}
              style={{ width: 150, borderRadius: 8 }} prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
            />
            <Button type="primary" size="large" loading={loading} onClick={handleCreate} icon={<PlusOutlined />}
              style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none', height: 40 }}>
              创建报告
            </Button>
          </div>

          {availablePoints.length > 0 && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e8ecf1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  选择采样点（{selectedPointIds.length}/{availablePoints.length}）
                </Typography.Text>
                <Space size="small">
                  <Button size="small" onClick={() => setSelectedPointIds(availablePoints.map((p: any) => p.id))}>全选</Button>
                  <Button size="small" onClick={() => setSelectedPointIds([])}>清空</Button>
                  <Divider type="vertical" />
                  <Button size="small" onClick={() => {
                    const name = prompt('模板名称（用于保存当前选择）：');
                    if (name) {
                      const templates = JSON.parse(localStorage.getItem('water_point_templates') || '{}');
                      templates[name] = { wtId: selectedWt, pointIds: selectedPointIds };
                      localStorage.setItem('water_point_templates', JSON.stringify(templates));
                      message.success(`模板「${name}」已保存`);
                    }
                  }}>保存模板</Button>
                  <Select
                    size="small" placeholder="加载模板" style={{ width: 130 }}
                    value={undefined}
                    onChange={name => {
                      if (!name) return;
                      const templates = JSON.parse(localStorage.getItem('water_point_templates') || '{}');
                      const tmpl = templates[name];
                      if (tmpl) {
                        if (tmpl.wtId === selectedWt) {
                          setSelectedPointIds(tmpl.pointIds.filter((id: number) => availablePoints.some((p: any) => p.id === id)));
                          message.success(`已加载模板「${name}」`);
                        } else {
                          message.warning('模板水样类型不匹配');
                        }
                      }
                    }}
                    options={Object.keys(JSON.parse(localStorage.getItem('water_point_templates') || '{}')).map(k => ({ label: k, value: k }))}
                  />
                </Space>
              </div>
              <Checkbox.Group
                value={selectedPointIds}
                onChange={v => setSelectedPointIds(v as number[])}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}
              >
                {availablePoints.map((pt: any) => (
                  <Checkbox key={pt.id} value={pt.id} style={{ fontSize: 13 }}>
                    <Tag color={AREA_COLORS[pt.area] || 'default'} style={{ borderRadius: 4, fontSize: 10, marginRight: 4 }}>{pt.area}</Tag>
                    {pt.name}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          )}
        </Card>
      )}

      {/* Record Info Bar (collapsible) */}
      {record && (
        <Card size="small" style={{ borderRadius: 10, marginBottom: 16, background: '#f8fafc', border: '1px solid #e8ecf1' }}
          bodyStyle={{ padding: recordInfoExpanded ? '12px 16px' : '6px 16px' }}>
          {recordInfoExpanded ? (
            <Descriptions size="small" column={6} colon={false}>
              <Descriptions.Item label="报告编号"><Typography.Text code>{record.record_no}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="水样类型">{waterTypes.find(w => w.id === record.water_type_id)?.name}</Descriptions.Item>
              <Descriptions.Item label="执行标准">{waterTypes.find(w => w.id === record.water_type_id)?.standard_code}</Descriptions.Item>
              <Descriptions.Item label="化验日期">{record.test_date}</Descriptions.Item>
              <Descriptions.Item label="化验员">{record.tester}</Descriptions.Item>
              <Descriptions.Item label="审核人">{record.reviewer || '—'}</Descriptions.Item>
            </Descriptions>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Typography.Text code style={{ fontSize: 12 }}>{record.record_no}</Typography.Text>
              <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>{waterTypes.find(w => w.id === record.water_type_id)?.name} | {record.test_date} | 化验员: {record.tester}</Typography.Text>
            </div>
          )}
          <Button type="link" size="small" onClick={() => setRecordInfoExpanded(!recordInfoExpanded)} style={{ position: 'absolute', right: 8, top: 4, fontSize: 11 }}>
            {recordInfoExpanded ? '收起 ▲' : '展开 ▼'}
          </Button>
        </Card>
      )}

      {/* Data Grid */}
      {details.length > 0 && (
        <div style={isFullscreen ? {
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
          background: '#fff', padding: 16, display: 'flex', flexDirection: 'column',
        } : {}}>
        <Card
          style={isFullscreen ? { flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 0, boxShadow: 'none' }
            : { borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          bodyStyle={isFullscreen ? { padding: '8px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }
            : { padding: '12px 16px' }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <Space size="middle">
                <ExperimentOutlined style={{ color: '#0891b2' }} />
                <span style={{ fontWeight: 600, fontSize: isFullscreen ? 18 : 15 }}>检测数据</span>
                <Tag style={{ borderRadius: 6 }}>{totalPoints} 采样点 × {indicators.length} 指标</Tag>
              </Space>

              {/* Toolbar */}
              <Space size="small" wrap>
                {/* View mode toggle */}
                <Radio.Group value={viewMode} onChange={e => setViewMode(e.target.value)} size="small" optionType="button" buttonStyle="solid">
                  <Radio.Button value="matrix"><TableOutlined /> 矩阵</Radio.Button>
                  <Radio.Button value="single"><UnorderedListOutlined /> 逐点</Radio.Button>
                </Radio.Group>

                {/* Single point selector */}
                {viewMode === 'single' && (
                  <>
                    {areas.length > 1 && (
                      <Select
                        size="small" style={{ width: 120 }} value={activeArea}
                        onChange={a => {
                          setActiveArea(a);
                          const areaPts = a === 'all' ? allPoints : allPoints.filter(p => p.sample_point_area === a);
                          const incomplete = areaPts.find(p => getRowStatus(p.sample_point_id) !== 'complete');
                          if (incomplete || areaPts[0]) setSinglePointId((incomplete || areaPts[0]).sample_point_id);
                        }}
                        options={[
                          { label: `全部 (${totalPoints})`, value: 'all' },
                          ...areas.map(a => ({ label: a, value: a })),
                        ]}
                      />
                    )}
                    <Select
                      size="small" style={{ width: 200 }} value={singlePointId}
                      onChange={setSinglePointId}
                      options={allPoints
                        .filter(p => activeArea === 'all' || p.sample_point_area === activeArea)
                        .map(p => ({
                          label: `${p.sample_point_name} (${getRowStatus(p.sample_point_id) === 'complete' ? '✓' : getRowStatus(p.sample_point_id) === 'partial' ? '◐' : '○'})`,
                          value: p.sample_point_id,
                        }))}
                    />
                  </>
                )}

                {/* Quick fills */}
                {isEditable && (
                  <>
                    <Divider type="vertical" />
                    <Tooltip title="将「肉眼可见物」全部填为「无」"><Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleQuickFill('肉眼可见物', '无')} style={{ borderRadius: 6 }}>无</Button></Tooltip>
                    <Tooltip title="将「总大肠菌群」全部填为「未检出」"><Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleQuickFill('总大肠菌群', '未检出')} style={{ borderRadius: 6 }}>未检出</Button></Tooltip>
                    <Tooltip title="将「臭和味」全部填为「无异臭、异味」"><Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleQuickFill('臭和味', '无异臭、异味')} style={{ borderRadius: 6 }}>无异味</Button></Tooltip>
                    <Tooltip title="将数值型列全部填为「合格」"><Button size="small" icon={<ThunderboltOutlined />} onClick={() => indicators.filter(i => i.value_type === 'numeric').forEach(i => handleQuickFill(i.name, '合格'))} style={{ borderRadius: 6 }}>全部合格</Button></Tooltip>
                  </>
                )}
                <Divider type="vertical" />
                <Tooltip title={isFullscreen ? '退出全屏' : '全屏填报'}>
                  <Button size="small" type="text"
                    icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setIsFullscreen(!isFullscreen)} />
                </Tooltip>
              </Space>
            </div>
          }
        >
          {/* Legend + Progress bar (collapsible) */}
          <div style={{
            marginBottom: 12, padding: '6px 14px', background: '#f8fafc', borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Space size="small">
                <Progress percent={Math.round(filledCells / (totalPoints * indicators.length) * 100)} size="small" style={{ width: 80 }}
                  strokeColor={abnormalItems.length > 0 ? '#faad14' : '#52c41a'} />
                <Typography.Text
                  style={{ fontSize: 12, color: '#0891b2', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => {
                    if (viewMode === 'single') {
                      const nextIncomplete = allPoints.find(p => {
                        const s = getRowStatus(p.sample_point_id);
                        return s !== 'complete' && p.sample_point_id !== singlePointId;
                      });
                      if (nextIncomplete) setSinglePointId(nextIncomplete.sample_point_id);
                    } else {
                      const nextIncomplete = allPoints.find(p => getRowStatus(p.sample_point_id) !== 'complete');
                      if (nextIncomplete && activeArea !== 'all' && nextIncomplete.sample_point_area !== activeArea) {
                        setActiveArea(nextIncomplete.sample_point_area);
                      }
                    }
                  }}
                >
                  已完成 {completedPoints}/{totalPoints} 采样点 {completedPoints < totalPoints ? '→ 跳转未完成' : '✓'}
                </Typography.Text>
              </Space>
              <Button type="link" size="small" onClick={() => setLegendExpanded(!legendExpanded)} style={{ fontSize: 11, padding: 0 }}>
                {legendExpanded ? '收起图例 ▲' : '图例说明 ▶'}
              </Button>
            </div>
            {legendExpanded && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                <Space size={4}><CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} /><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>已填完</Typography.Text></Space>
                <Space size={4}><span style={{ color: '#faad14', fontSize: 12 }}>◐</span><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>部分填写</Typography.Text></Space>
                <Space size={4}><span style={{ color: '#d9d9d9', fontSize: 12 }}>○</span><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>未填</Typography.Text></Space>
                <Space size={4}><CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} /><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>超标</Typography.Text></Space>
                <Divider type="vertical" />
                <Space size={4}><div style={{ width: 12, height: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 2 }} /><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>合格</Typography.Text></Space>
                <Space size={4}><div style={{ width: 12, height: 12, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 2 }} /><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>超标</Typography.Text></Space>
                <Divider type="vertical" />
                <Space size={4}><div style={{ width: 12, height: 12, background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 2 }} /><Typography.Text style={{ fontSize: 12, color: '#64748b' }}>刚粘贴</Typography.Text></Space>
              </div>
            )}
          </div>

          {/* Area tabs (only in matrix mode) */}
          {viewMode === 'matrix' && areas.length > 1 && (
            <Tabs
              activeKey={activeArea}
              onChange={setActiveArea}
              size="small"
              style={{ marginBottom: 12 }}
              items={[
                { key: 'all', label: `全部 (${totalPoints})` },
                ...areas.map(a => {
                  const cnt = allPoints.filter(p => p.sample_point_area === a).length;
                  const done = allPoints.filter(p => p.sample_point_area === a && getRowStatus(p.sample_point_id) === 'complete').length;
                  return { key: a, label: `${a} (${done}/${cnt})` };
                }),
              ]}
            />
          )}

          {/* Abnormal Banner — collapsible, context-aware */}
          {abnormalItems.length > 0 && (() => {
            const byPoint: Record<number, any[]> = {};
            abnormalItems.forEach(d => {
              if (!byPoint[d.sample_point_id]) byPoint[d.sample_point_id] = [];
              byPoint[d.sample_point_id].push(d);
            });
            // In single-point mode, only show current point's items
            const filteredByPoint = viewMode === 'single' && singlePointId
              ? (byPoint[singlePointId] ? { [singlePointId]: byPoint[singlePointId] } : {})
              : byPoint;
            const pointCount = Object.keys(filteredByPoint).length;
            const itemCount = Object.values(filteredByPoint).flat().length;

            return (
              <div style={{
                marginBottom: 12, padding: '10px 18px', background: 'linear-gradient(135deg, #fff2f0, #fff7ed)',
                borderRadius: 10, border: '1px solid #ffccc7',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => setAbnormalExpanded(!abnormalExpanded)}>
                  <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                  <Typography.Text strong style={{ color: '#cf1322', fontSize: 13, flex: 1 }}>
                    {viewMode === 'single' && singlePointId
                      ? `当前点位 ${itemCount} 项超标`
                      : `检出 ${itemCount} 项超标（${pointCount} 个点位）`}
                  </Typography.Text>
                  <Button type="link" size="small" style={{ fontSize: 11 }}>
                    {abnormalExpanded ? '收起 ▲' : '展开 ▼'}
                  </Button>
                </div>

                {abnormalExpanded && (
                  <div style={{ marginTop: 10 }}>
                    {Object.entries(filteredByPoint).map(([spId, items]) => {
                      const ptName = items[0]?.sample_point_name || '';
                      const pointPhotos = photos[parseInt(spId)] || [];
                      return (
                        <div key={spId} style={{
                          marginBottom: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.6)',
                          borderRadius: 8, border: '1px solid #ffd591',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                              <Typography.Text strong style={{ fontSize: 13, marginRight: 6 }}>{ptName}</Typography.Text>
                              {items.map(d => (
                                <Tag key={d.id} color="error" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>
                                  {d.indicator_name}: <strong>{d.value_text}</strong>
                                </Tag>
                              ))}
                            </div>
                            <Space size={6}>
                              {pointPhotos.map(p => (
                                <Tooltip key={p.id} title={
                                  <img src={p.url} alt="" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 4 }} />
                                }>
                                  <Tag color="processing" style={{ borderRadius: 4, cursor: 'pointer' }}>
                                    <PictureOutlined style={{ marginRight: 4 }} />照片
                                    <DeleteOutlined style={{ marginLeft: 4, fontSize: 10 }}
                                      onClick={e => { e.stopPropagation(); handleDeletePhoto(p.id); }} />
                                  </Tag>
                                </Tooltip>
                              ))}
                              {isEditable && (
                                <Button size="small" type="dashed" icon={<CameraOutlined />}
                                  onClick={() => handleUploadPhoto(parseInt(spId))}
                                  style={{ borderRadius: 6, fontSize: 11 }}>拍照</Button>
                              )}
                            </Space>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {abnormalItems.length === 0 && details.some(d => d.is_qualified === true) && (
            <div style={{
              marginBottom: 12, padding: '8px 18px', background: '#f6ffed',
              borderRadius: 10, border: '1px solid #b7eb8f',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
              <Typography.Text style={{ color: '#389e0d' }}>所有已填报指标均符合标准</Typography.Text>
            </div>
          )}

          <Table
            columns={columns}
            dataSource={
              viewMode === 'single'
                ? [limitRow, ...allPoints.filter(p => p.sample_point_id === singlePointId).map(p => ({ ...p, key: String(p.sample_point_id) }))]
                : [limitRow, ...visiblePoints.map(p => ({ ...p, key: String(p.sample_point_id) }))]
            }
            pagination={false}
            scroll={{ x: 250 + indicators.length * 120, y: 'calc(100vh - 480px)' }}
            size="small"
            bordered
            rowClassName={(r: any) => {
              if (r.sample_point_id === -1) return 'limit-reference-row';
              const s = getRowStatus(r.sample_point_id);
              return s === 'abnormal' ? 'row-abnormal' : s === 'empty' ? 'row-empty' : '';
            }}
            onRow={(r: any) => {
              if (r.sample_point_id === -1) {
                return {
                  style: {
                    background: '#f0f5fa', fontWeight: 500, fontSize: 11, color: '#475569',
                    fontStyle: 'italic', height: 28,
                  },
                };
              }
              return {
                style: {
                  background: getRowStatus(r.sample_point_id) === 'abnormal' ? '#fffbe6'
                    : getRowStatus(r.sample_point_id) === 'empty' ? '#fafafa' : undefined,
                },
              };
            }}
          />

          {/* Bottom status bar */}
          <div style={{
            marginTop: 12, padding: '8px 14px', background: '#f8fafc', borderRadius: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Space size="large">
              <Typography.Text
                style={{ fontSize: 12, color: completedPoints < totalPoints ? '#0891b2' : '#64748b', cursor: completedPoints < totalPoints ? 'pointer' : 'default', textDecoration: completedPoints < totalPoints ? 'underline' : 'none' }}
                onClick={() => {
                  if (completedPoints >= totalPoints) return;
                  if (viewMode === 'single') {
                    const next = allPoints.find(p => getRowStatus(p.sample_point_id) !== 'complete' && p.sample_point_id !== singlePointId);
                    if (next) { setSinglePointId(next.sample_point_id); if (next.sample_point_area !== activeArea) setActiveArea('all'); }
                  } else {
                    const next = allPoints.find(p => getRowStatus(p.sample_point_id) !== 'complete');
                    if (next?.sample_point_area && next.sample_point_area !== activeArea) setActiveArea(next.sample_point_area);
                  }
                }}
              >
                <CheckCircleOutlined style={{ color: completedPoints >= totalPoints ? '#52c41a' : '#0891b2' }} /> 已完成 {completedPoints}/{totalPoints} 采样点
                {completedPoints < totalPoints && ' → 跳转未完成'}
              </Typography.Text>
              {abnormalItems.length > 0 && (
                <Typography.Text style={{ fontSize: 12, color: '#ff4d4f' }}>
                  <ExclamationCircleOutlined /> {abnormalItems.length} 项超标
                </Typography.Text>
              )}
            </Space>
            {isEditable && (
              <Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
                <InfoCircleOutlined /> Tab 跳格 · Enter 换行 · 点击列头一键填充
              </Typography.Text>
            )}
          </div>

          {/* Conclusion — always visible when record exists */}
          {record && (
            <div style={{ marginTop: 20 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>结论与备注</Typography.Text>
              <Input.TextArea
                value={conclusion}
                onChange={e => { setConclusion(e.target.value); setAutoSaveStatus('unsaved'); }}
                placeholder={abnormalItems.length > 0 ? '说明超标原因及整改措施...' : '本次检测项目全部合格'}
                rows={2}
                disabled={record?.status === 'reviewed'}
                style={{ marginTop: 8, borderRadius: 8 }}
              />
            </div>
          )}
        </Card>
        </div>
      )}

      {/* Batch Paste Modal */}
      <Modal
        title="批量粘贴数据"
        open={pasteModalOpen}
        onOk={handleBatchPaste}
        onCancel={() => { setPasteModalOpen(false); setPasteText(''); }}
        okText="粘贴"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">
            从 Excel 复制数据后粘贴到下方（Tab 分隔列，换行分隔行）。<br />
            每行对应一个采样点（按表格顺序），每列对应一个指标。
          </Typography.Text>
        </div>
        <Input.TextArea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          rows={10}
          placeholder={`粘贴示例：\n无\t0.4\t1.2\t7.8\t合格\t未检出\t0.5\t无异味\n无\t0.3\t1.8\t7.2\t合格\t未检出\t0.3\t无异味`}
          style={{ fontFamily: 'monospace', fontSize: 12, borderRadius: 8 }}
        />
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            将粘贴到 {visiblePoints.length} 个采样点 × {indicators.length} 个指标的表格中
          </Typography.Text>
        </div>
      </Modal>

    </div>
  );
}
