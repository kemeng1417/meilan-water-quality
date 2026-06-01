import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  Card, Select, DatePicker, Input, Button, Table, message,
  Space, Typography, Tag, Descriptions, Popconfirm, Tooltip, Divider,
  Breadcrumb, Progress, Dropdown, Checkbox, Tabs, Modal, Radio, Spin, Collapse,
} from 'antd';
import {
  SaveOutlined, SendOutlined, DownloadOutlined,
  PlusOutlined, ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined, UserOutlined, ThunderboltOutlined,
  HomeOutlined, SwapOutlined,
  TableOutlined, UnorderedListOutlined, InfoCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
  CameraOutlined, PictureOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getWaterTypes, getIndicators, getLimits,
  createRecord, getRecord, getDetails, saveDetails, reviewRecord, updateRecord,
  exportWord, exportExcel, exportHtml, exportPdf, rejectRecord,
  getSamplePoints, uploadPhoto, getPhotos, deletePhoto,
  removePointFromRecord, addPointToRecord, ocrRecognize,
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
const LS_LAST_TESTER = 'water_last_tester';

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
  const [limits2, setLimits2] = useState<LimitInfo[]>([]); // combined report second limits
  const [availablePoints, setAvailablePoints] = useState<any[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<number[]>([]);
  const [record, setRecord] = useState<any>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tester, setTester] = useState(user.display_name || localStorage.getItem(LS_LAST_TESTER) || '');
  const [testDate, setTestDate] = useState<dayjs.Dayjs>(dayjs());
  const [reportDate, setReportDate] = useState<dayjs.Dayjs>(dayjs());
  const [conclusion, setConclusion] = useState('');
  const [conclusionEdited, setConclusionEdited] = useState(false);
  const [reviewer, setReviewer] = useState('');

  // New UX state
  const [viewMode, setViewMode] = useState<'matrix' | 'single'>('matrix');
  const [activeArea, setActiveArea] = useState<string>('all');
  const [singlePointId, setSinglePointId] = useState<number | null>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [photos, setPhotos] = useState<Record<number, any[]>>({});
  const [previewImage, setPreviewImage] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [abnormalExpanded, setAbnormalExpanded] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');
  const [lastSaved, setLastSaved] = useState<string>('');
  const [recordInfoExpanded, setRecordInfoExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [addPointModalOpen, setAddPointModalOpen] = useState(false);
  const [allActivePoints, setAllActivePoints] = useState<any[]>([]);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, Record<string, string>> | null>(null);
  const [ocrEditedResult, setOcrEditedResult] = useState<Record<string, Record<string, string>> | null>(null);
  const [ocrError, setOcrError] = useState('');
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const performSaveRef = useRef<(isAutoSave: boolean) => Promise<void>>(async () => {});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const undoStack = useRef<DetailRow[][]>([]);
  const redoStack = useRef<DetailRow[][]>([]);
  const isComposingRef = useRef(false);
  const [changedCells, setChangedCells] = useState<Set<string>>(new Set());
  const [pointSearch, setPointSearch] = useState('');
  const [templateVersion, setTemplateVersion] = useState(0);

  // ── Data Loading ──
  useEffect(() => { getWaterTypes().then(res => setWaterTypes(res.data)); }, []);

  useEffect(() => {
    if (!selectedWt) return;
    setAvailablePoints([]);
    setSelectedPointIds([]);
    getIndicators(selectedWt).then(res => setIndicators(res.data));
    getLimits(selectedWt).then(res => setLimits(res.data));
    // For combined type (4), also load limits for type 2 (末梢水)
    if (selectedWt === 4) {
      getLimits(2).then(res => setLimits2(res.data));
    } else {
      setLimits2([]);
    }
    getSamplePoints(selectedWt).then(res => {
      const sorted = [...res.data].sort((a: any, b: any) => {
        const areaCmp = (a.area || '').localeCompare(b.area || '', 'zh');
        if (areaCmp !== 0) return areaCmp;
        return (a.name || '').localeCompare(b.name || '', 'zh');
      });
      setAvailablePoints(sorted);
      if (!recordId) {
        const saved = localStorage.getItem(`${LS_LAST_POINTS}_${selectedWt}`);
        setSelectedPointIds(saved ? JSON.parse(saved) : sorted.map((p: any) => p.id));
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
      if (autoSaveStatus === 'unsaved') performSaveRef.current(true);
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
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      if (isComposingRef.current) return; // Skip edit shortcuts during IME composition
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [details, isFullscreen]);
  useEffect(() => {
    if (selectedWt) localStorage.setItem(LS_LAST_WT, String(selectedWt));
    if (selectedWt && selectedPointIds.length > 0 && availablePoints.length > 0) {
      // 仅保存属于当前 availablePoints 的 ID，防止水样切换时跨类型污染
      const validIds = new Set(availablePoints.map((p: any) => p.id));
      if (selectedPointIds.every(id => validIds.has(id))) {
        localStorage.setItem(`${LS_LAST_POINTS}_${selectedWt}`, JSON.stringify(selectedPointIds));
      }
    }
  }, [selectedWt, selectedPointIds, availablePoints]);

  // ── Record CRUD ──
  const handleCreate = async () => {
    if (!selectedWt) { message.warning('请选择水样类型'); return; }
    if (!tester) { message.warning('请输入化验员'); return; }
    if (selectedPointIds.length === 0) { message.warning('请至少选择一个采样点'); return; }

    const wtName = waterTypes.find(w => w.id === selectedWt)?.name || '';
    const selectedNames = availablePoints
      .filter((p: any) => selectedPointIds.includes(p.id))
      .map((p: any) => p.name)
      .join('、');

    Modal.confirm({
      title: '确认创建报告',
      icon: <ExclamationCircleOutlined />,
      content: (
        <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
          <Descriptions.Item label="水样类型">{wtName}</Descriptions.Item>
          <Descriptions.Item label="化验日期">{testDate.format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="报告日期">{reportDate.format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="化验员">{tester}</Descriptions.Item>
          <Descriptions.Item label="采样点 ({count})">{selectedNames}</Descriptions.Item>
        </Descriptions>
      ) as any,
      okText: '确认创建',
      cancelText: '取消',
      width: 480,
      onOk: async () => {
        setLoading(true);
        try {
          const res = await createRecord({
            water_type_id: selectedWt,
            test_date: testDate.format('YYYY-MM-DD'),
            report_date: reportDate.format('YYYY-MM-DD'),
            tester,
            point_ids: selectedPointIds,
          });
          const rec = res.data;
          setRecord(rec);
          setPointSearch(''); // clear search after creation
          const detRes = await getDetails(rec.id);
          setDetails(detRes.data);
          const pts = [...new Set(detRes.data.map((d: DetailRow) => d.sample_point_id))];
          if (pts.length > 0) setSinglePointId(Number(pts[0]));
          message.success(`报告 ${rec.record_no} 已创建`);
          navigate(`/records/${rec.id}`, { replace: true });
        } catch (e: any) { message.error(e?.response?.data?.detail || '创建失败'); }
        finally { setLoading(false); }
      },
    });
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
    if (record) loadPhotos();
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
      let ok = 0;
      for (let i = 0; i < files.length; i++) {
        try {
          message.loading({ content: `上传照片 ${i + 1}/${files.length}...`, key: 'upload', duration: 0 });
          await uploadPhoto(record.id, samplePointId, files[i]);
          ok++;
        } catch { message.error({ content: `照片 ${i + 1} 上传失败`, key: 'upload' }); }
      }
      if (ok > 0) message.success({ content: `已上传 ${ok}${ok < files.length ? `/${files.length}` : ''} 张照片`, key: 'upload' });
      else message.error({ content: '上传失败', key: 'upload' });
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

  const handleDeleteRow = async (samplePointId: number) => {
    if (!record) return;
    const ptName = allPoints.find(p => p.sample_point_id === samplePointId)?.sample_point_name || '';
    Modal.confirm({
      title: '确认删除',
      content: `确定要从本报告中移除「${ptName}」吗？该点位的全部检测数据和照片将被删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removePointFromRecord(record.id, samplePointId);
          setDetails(prev => prev.filter(d => d.sample_point_id !== samplePointId));
          setPhotos(prev => { const n = { ...prev }; delete n[samplePointId]; return n; });
          message.success('已移除');
        } catch { message.error('删除失败'); }
      },
    });
  };

  const handleAddPoint = async (samplePointId: number) => {
    if (!record) return;
    try {
      const res = await addPointToRecord(record.id, samplePointId);
      const pt = res.data;
      const newDetails: DetailRow[] = indicators.map(ind => ({
        id: 0, sample_point_id: samplePointId, sample_point_name: pt.sample_point_name,
        sample_point_code: pt.sample_point_code || '', sample_point_area: pt.sample_point_area || '',
        indicator_id: ind.id, indicator_name: ind.name, indicator_unit: ind.unit,
        indicator_type: ind.value_type, value_text: null, value_num: null,
        is_qualified: null, is_abnormal: false,
      }));
      setDetails(prev => [...prev, ...newDetails]);
      setAddPointModalOpen(false);
      message.success(`已添加「${pt.sample_point_name}」`);
    } catch { message.error('添加失败'); }
  };

  // Normalize indicator name for fuzzy matching
  const normalizeName = (name: string) => {
    return name
      .replace(/\(.*?\)/g, '')
      .replace(/（.*?）/g, '')
      .replace(/值$/, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  };

  const handleOcrRecognize = async () => {
    if (!ocrInputRef.current) {
      ocrInputRef.current = document.createElement('input');
      ocrInputRef.current.type = 'file';
      ocrInputRef.current.accept = 'image/*';
      ocrInputRef.current.setAttribute('capture', 'environment');
    }
    const input = ocrInputRef.current;
    input.onchange = async () => {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      setOcrModalOpen(true);
      setOcrLoading(true);
      setOcrResult(null);
      setOcrEditedResult(null);
      setOcrError('');
      try {
        const res = await ocrRecognize(file);
        if (res.data.success) {
          // Remap OCR indicator keys to match database indicator names
          const rawData = res.data.data;
          const remapped: Record<string, Record<string, string>> = {};
          for (const [ptName, values] of Object.entries(rawData)) {
            const newValues: Record<string, string> = {};
            const rawValMap = values as Record<string, string>;
            for (const [key, val] of Object.entries(rawValMap)) {
              // Find matching DB indicator name
              const dbInd = indicators.find(ind => normalizeName(ind.name) === normalizeName(key));
              const mappedKey = dbInd ? dbInd.name : key;
              newValues[mappedKey] = val as string;
            }
            remapped[ptName] = newValues;
          }
          setOcrResult(remapped);
          setOcrEditedResult(remapped);
        } else {
          setOcrError(res.data.error || '识别失败');
        }
      } catch (e: any) {
        setOcrError(e?.response?.data?.detail || e?.message || '识别请求失败，请重试');
      } finally {
        setOcrLoading(false);
        input.value = '';
      }
    };
    input.click();
  };
  void handleOcrRecognize; // reserved

  const handleOcrFill = () => {
    if (!ocrEditedResult) return;
    let filled = 0;
    setDetails(prev => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      // Build normalized index for OCR result keys
      const ocrPointNames = Object.keys(ocrEditedResult);
      const ocrNormMap: Record<string, string> = {};
      ocrPointNames.forEach(name => { ocrNormMap[normalizeName(name)] = name; });
      // Build normalized indicator key map
      const ocrFirstPoint = ocrEditedResult[ocrPointNames[0]];
      const ocrIndNormMap: Record<string, string> = {};
      if (ocrFirstPoint) {
        Object.keys(ocrFirstPoint).forEach(name => { ocrIndNormMap[normalizeName(name)] = name; });
      }

      return prev.map(d => {
        // Try exact point name match first, then normalized match
        let ptData = ocrEditedResult[d.sample_point_name];
        if (!ptData) {
          const normPt = normalizeName(d.sample_point_name);
          const matchedKey = ocrNormMap[normPt];
          if (matchedKey) ptData = ocrEditedResult[matchedKey];
        }
        if (ptData) {
          // Try exact indicator name match first, then normalized
          let val = ptData[d.indicator_name];
          if (val === undefined || val === '') {
            const normInd = normalizeName(d.indicator_name);
            const matchedInd = ocrIndNormMap[normInd];
            if (matchedInd) val = ptData[matchedInd];
          }
          if (val !== undefined && val !== '' && val !== null) {
            filled++;
            return { ...d, value_text: val };
          }
        }
        return d;
      });
    });
    setOcrModalOpen(false);
    setAutoSaveStatus('unsaved');
    message.success(`已自动填充 ${filled} 个单元格，请核对后保存`);
  };

  const ocrInputRef = useRef<HTMLInputElement | null>(null);

  const ocrThStyle: React.CSSProperties = {
    padding: '6px 4px', textAlign: 'center', border: '1px solid #d9d9d9',
    fontWeight: 600, fontSize: 12, background: '#f0f5fa',
  };
  const ocrTdStyle: React.CSSProperties = {
    padding: '4px', textAlign: 'center', border: '1px solid #e8ecf1',
  };

  // ── Local compliance check (mirrors backend compliance.py) ──
  const getLimitForPoint = (samplePointId: number, indicatorId: number): LimitInfo | undefined => {
    const pt = availablePoints.find((p: any) => p.id === samplePointId);
    if (selectedWt === 4 && pt) {
      return (pt.water_type_id === 2 ? limits2 : limits).find(l => l.indicator_id === indicatorId);
    }
    return limits.find(l => l.indicator_id === indicatorId);
  };

  const computeLocalCompliance = (samplePointId: number, indicatorId: number, valueText: string | null):
    { is_qualified: boolean | null; is_abnormal: boolean } => {
    const lim = getLimitForPoint(samplePointId, indicatorId);
    if (!lim) return { is_qualified: true, is_abnormal: false };
    // Qualitative
    if (lim.qual_check) {
      if (lim.qual_check === '不应检出') {
        const ok = ['未检出', '0', '—', '/', '<1', '阴性', '未发现'];
        if (valueText && !ok.includes(valueText.trim())) return { is_qualified: false, is_abnormal: true };
      } else if (lim.qual_check === '无' || lim.qual_check === '无异臭、异味') {
        const ok = ['无', '无异臭、异味', '合格', '—', '/'];
        if (valueText && !ok.includes(valueText.trim())) return { is_qualified: false, is_abnormal: true };
      }
      return { is_qualified: true, is_abnormal: false };
    }
    // Numeric
    if (valueText && valueText.trim() === '合格') return { is_qualified: true, is_abnormal: false };
    const num = (() => {
      if (!valueText) return null;
      const m = valueText.trim().match(/[\d.]+/);
      return m ? parseFloat(m[0]) : null;
    })();
    if (num === null) return { is_qualified: null, is_abnormal: false };
    if (lim.max_value != null && num > lim.max_value) return { is_qualified: false, is_abnormal: true };
    if (lim.min_value != null && num < lim.min_value) return { is_qualified: false, is_abnormal: true };
    return { is_qualified: true, is_abnormal: false };
  };

  const updateCell = (samplePointId: number, indicatorId: number, value: string) => {
    setDetails(prev => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      const result = computeLocalCompliance(samplePointId, indicatorId, value);
      return prev.map(d =>
        d.sample_point_id === samplePointId && d.indicator_id === indicatorId
          ? { ...d, value_text: value, value_num: result.is_qualified === null ? d.value_num : parseFloat((value.match(/[\d.]+/) || [])[0]) || null, is_qualified: result.is_qualified, is_abnormal: result.is_abnormal } : d
      );
    });
    setAutoSaveStatus('unsaved');
  };

  const performSave = async (isAutoSave = false) => {
    if (!record) return;
    isComposingRef.current = false; // safety: prevent stuck IME flag
    setSaving(true);
    if (!isAutoSave) setAutoSaveStatus('saving');
    try {
      const items = details
        .filter(d => d.value_text != null && d.value_text !== '')
        .map(d => ({ sample_point_id: d.sample_point_id, indicator_id: d.indicator_id, value_text: d.value_text || '' }));
      const res = await saveDetails(record.id, items);
      if (!isAutoSave) {
        // Manual save: refresh from server to ensure data consistency
        const detRes = await getDetails(record.id);
        setDetails(detRes.data);
      }
      // 用户手动编辑过的结论不覆盖，否则始终用后端最新自动生成
      if (res.data.conclusion && !conclusionEdited) {
        setConclusion(res.data.conclusion);
      }
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
  performSaveRef.current = performSave;

  const handleSave = async () => {
    await performSave(false);
    if (record) {
      try {
        const res = await updateRecord(record.id, { conclusion });
        setRecord((prev: any) => ({ ...prev, ...res.data, status: res.data.status || prev.status }));
      } catch { /* silent */ }
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

  // 清空当前列
  const handleClearColumn = (indicatorId: number) => {
    const ind = indicators.find(i => i.id === indicatorId);
    const colName = ind ? `${ind.name}列` : '该列';
    Modal.confirm({
      title: `清空${colName}`,
      content: `确定清空「${ind?.name}」列的全部已填数据吗？（可通过 Ctrl+Z 撤销）`,
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        const visiblePtIds = new Set(getVisiblePoints().map(p => p.sample_point_id));
        setDetails(prev => {
          undoStack.current.push(prev);
          redoStack.current = [];
          return prev.map(d =>
            d.indicator_id === indicatorId && visiblePtIds.has(d.sample_point_id)
              ? { ...d, value_text: '', value_num: null, is_qualified: null, is_abnormal: false } : d
          );
        });
        setAutoSaveStatus('unsaved');
      },
    });
  };

  // 重置本行（清空数据，不删点位）
  const handleClearRow = (samplePointId: number) => {
    const ptName = allPoints.find(p => p.sample_point_id === samplePointId)?.sample_point_name || '';
    Modal.confirm({
      title: '重置本行',
      content: `确定清空「${ptName}」的全部已填数据吗？（可通过 Ctrl+Z 撤销）`,
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setDetails(prev => {
          undoStack.current.push(prev);
          redoStack.current = [];
          return prev.map(d =>
            d.sample_point_id === samplePointId
              ? { ...d, value_text: '', value_num: null, is_qualified: null, is_abnormal: false } : d
          );
        });
        setAutoSaveStatus('unsaved');
      },
    });
  };

  // 一键清空全部
  const handleClearAll = () => {
    Modal.confirm({
      title: '清空全部数据',
      content: `确定清空当前报告所有已填的检测数据吗？（可通过 Ctrl+Z 撤销）`,
      okText: '全部清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setDetails(prev => {
          undoStack.current.push(prev);
          redoStack.current = [];
          return prev.map(d => ({ ...d, value_text: '', value_num: null, is_qualified: null, is_abnormal: false }));
        });
        setAutoSaveStatus('unsaved');
      },
    });
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
      } else if (dir === 1 && viewMode === 'single') {
        // Tab from last cell in single mode: jump to next point
        const vpts = getVisiblePoints();
        const ptIdx = vpts.findIndex(p => p.sample_point_id === samplePointId);
        if (ptIdx >= 0 && ptIdx < vpts.length - 1) {
          setSinglePointId(vpts[ptIdx + 1].sample_point_id);
          setTimeout(() => {
            const firstInput = document.querySelector<HTMLInputElement>('[data-cell-input]');
            if (firstInput) { firstInput.focus(); firstInput.select(); }
          }, 100);
        }
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
  const _fmtOne = (lim: LimitInfo | undefined) => {
    if (!lim) return null;
    if (lim.qual_check) return lim.qual_check;
    if (lim.min_value != null && lim.max_value != null) return `${lim.min_value}~${lim.max_value}`;
    if (lim.max_value != null) return `≤${lim.max_value}`;
    if (lim.min_value != null) return `≥${lim.min_value}`;
    return null;
  };

  const getLimitText = (indicatorId: number): string => {
    const t1 = _fmtOne(limits.find(l => l.indicator_id === indicatorId));
    const t2 = _fmtOne(limits2.find(l => l.indicator_id === indicatorId));
    if (!t2 || t1 === t2) return t1 || '';
    return `出厂:${t1} 末梢:${t2}`;
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

  // ── Editable flag (must be before columns, used in column headers) ──
  const isDraft = record?.status === 'draft';
  const isRejected = record?.status === 'rejected';
  const isEditable = isDraft || isRejected;

  // ── Table columns ──
  const indicatorColumns = indicators.map(ind => ({
    title: (
      <Tooltip title={`标准: ${getLimitText(ind.id)}`} placement="top">
        <div style={{ textAlign: 'center' }}>
          <div style={{ cursor: 'pointer', display: 'inline-block' }}
            onClick={() => handleQuickFillColumn(ind.id, ind.value_type === 'text' ? (ind.name === '肉眼可见物' ? '无' : ind.name === '总大肠菌群' ? '未检出' : ind.name === '臭和味' ? '无异臭、异味' : '') : '合格')}>
            <div style={{ fontWeight: 600, fontSize: isFullscreen ? 15 : 13 }}>{ind.name}</div>
            {ind.unit && <div style={{ fontSize: isFullscreen ? 12 : 11, color: '#94a3b8' }}>({ind.unit})</div>}
          </div>
          {isEditable && (
            <Popconfirm title={`清空${ind.name}列？`} onConfirm={() => handleClearColumn(ind.id)} okText="清空" cancelText="取消">
              <DeleteOutlined
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', top: 2, right: 2, fontSize: 10, color: '#c0c0c0', cursor: 'pointer' }}
                title={`清空${ind.name}列`}
              />
            </Popconfirm>
          )}
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
            updateCell(row.sample_point_id, ind.id, e.target.value);
          }}
          onBlur={() => { isComposingRef.current = false; }}
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
    {
      title: '结论', width: 130, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: any) => {
        if (r.sample_point_id === -1) return null;
        const status = getRowStatus(r.sample_point_id);
        let tag;
        if (status === 'complete') {
          tag = <Tag color="success" style={{ borderRadius: 6, margin: 0 }}>合格</Tag>;
        } else if (status === 'abnormal') {
          tag = <Tag color="error" style={{ borderRadius: 6, margin: 0 }}>不合格</Tag>;
        } else if (status === 'partial') {
          tag = <Tag color="warning" style={{ borderRadius: 6, margin: 0 }}>待完成</Tag>;
        } else {
          tag = <Tag style={{ borderRadius: 6, margin: 0, color: '#c0c0c0' }}>未填报</Tag>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
            {tag}
            {isEditable && (
              <Popconfirm title="清空此行数据？" onConfirm={() => handleClearRow(r.sample_point_id)} okText="清空" cancelText="取消">
                <Button type="link" size="small" style={{ fontSize: 10, padding: 0, height: 18 }} onClick={e => e.stopPropagation()}>清空</Button>
              </Popconfirm>
            )}
            {isEditable && (
              <Popconfirm title="删除此采样点？" description="数据和照片将一并删除" onConfirm={() => handleDeleteRow(r.sample_point_id)} okText="删除" cancelText="取消" okType="danger">
                <DeleteOutlined
                  style={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer', marginLeft: 2 }}
                  onClick={e => e.stopPropagation()}
                />
              </Popconfirm>
            )}
          </div>
        );
      },
    },
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
  // (isDraft / isRejected / isEditable defined above columns, reused here)
  // Anyone can review — just enter name and click
  const abnormalItems = details.filter(d => d.is_abnormal);
  const filledCells = details.filter(d => d.value_text && d.value_text.trim()).length;
  const filledPoints = visiblePoints.filter(p => {
    const s = getRowStatus(p.sample_point_id);
    return s === 'complete' || s === 'abnormal';
  }).length;
  const abnormalPoints = visiblePoints.filter(p => getRowStatus(p.sample_point_id) === 'abnormal').length;
  const totalPoints = visiblePoints.length;

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
                <Button icon={<SwapOutlined />} onClick={() => setPasteModalOpen(true)} style={{ borderRadius: 8 }}>批量粘贴</Button>
                <Button icon={<PlusOutlined />} onClick={() => {
                  getSamplePoints(record?.water_type_id || selectedWt, null).then(res => {
                    setAllActivePoints(res.data.filter((p: any) => !allPoints.some(ap => ap.sample_point_id === p.id)));
                    setAddPointModalOpen(true);
                  });
                }} style={{ borderRadius: 8 }}>添加点位</Button>
                <Popconfirm title="清空当前报告所有已填数据？" description="可通过 Ctrl+Z 撤销" onConfirm={handleClearAll} okText="全部清空" cancelText="取消" okType="danger">
                  <Button icon={<DeleteOutlined />} danger style={{ borderRadius: 8 }}>清空数据</Button>
                </Popconfirm>
                {/* 打回 → 重新提交；草稿 → 提交审核 */}
                {record?.status === 'rejected' ? (
                  <Popconfirm title="重新提交审核？" onConfirm={handleSubmit} okText="确认" cancelText="取消">
                    <Button type="primary" icon={<SendOutlined />} style={{ borderRadius: 8 }}>重新提交</Button>
                  </Popconfirm>
                ) : (
                  <Popconfirm title="提交后将无法修改，确认提交？" onConfirm={handleSubmit} okText="确认提交" cancelText="取消">
                    <Button type="primary" icon={<SendOutlined />} style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none' }}>提交审核</Button>
                  </Popconfirm>
                )}
              </>
            )}
            {/* Review — only for submitted records */}
            {record?.status === 'submitted' && (
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
              <span style={{ fontSize: 13, color: '#64748b' }}>化验日期：</span>
              <DatePicker size="large" value={testDate} onChange={d => setTestDate(d || dayjs())} style={{ borderRadius: 8 }} />
              <Button size="small" onClick={() => setTestDate(dayjs().subtract(1, 'day'))}>昨天</Button>
              <Button size="small" onClick={() => setTestDate(dayjs())}>今天</Button>
            </Space>
            <Space size={4}>
              <span style={{ fontSize: 13, color: '#64748b' }}>报告日期：</span>
              <DatePicker size="large" value={reportDate} onChange={d => setReportDate(d || dayjs())} style={{ borderRadius: 8 }} />
              <Button size="small" onClick={() => setReportDate(dayjs())}>今天</Button>
            </Space>
            <Input size="large" placeholder="化验员" value={tester} onChange={e => { setTester(e.target.value); localStorage.setItem(LS_LAST_TESTER, e.target.value); }}
              style={{ width: 150, borderRadius: 8 }} prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
            />
            <Button type="primary" size="large" loading={loading} onClick={handleCreate} icon={<PlusOutlined />}
              style={{ borderRadius: 8, background: 'linear-gradient(135deg, #0e7490, #0891b2)', border: 'none', height: 40 }}>
              创建报告
            </Button>
          </div>

          {availablePoints.length > 0 && (() => {
            const searchLower = pointSearch.toLowerCase();
            const filteredPoints = availablePoints.filter((pt: any) =>
              !pointSearch || pt.name.toLowerCase().includes(searchLower) || (pt.area || '').toLowerCase().includes(searchLower)
            );
            const areaGroups = new Map<string, any[]>();
            filteredPoints.forEach((pt: any) => {
              const area = pt.area || '未分类';
              if (!areaGroups.has(area)) areaGroups.set(area, []);
              areaGroups.get(area)!.push(pt);
            });
            const templates = JSON.parse(localStorage.getItem('water_point_templates') || '{}'); void templateVersion;
            const templateKeys = Object.keys(templates);
            return (
              <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e8ecf1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <Space size={8}>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      选择采样点（{selectedPointIds.length}/{availablePoints.length}）
                    </Typography.Text>
                    <Input
                      size="small"
                      placeholder="搜索采样点…"
                      prefix={<span style={{ fontSize: 11 }}>🔍</span>}
                      style={{ width: 160 }}
                      allowClear
                      value={pointSearch}
                      onChange={e => setPointSearch(e.target.value)}
                    />
                  </Space>
                  <Space size="small">
                    <Button size="small" onClick={() => setSelectedPointIds(availablePoints.map((p: any) => p.id))}>全选</Button>
                    <Button size="small" onClick={() => setSelectedPointIds([])}>清空</Button>
                    <Button size="small" onClick={() => {
                      setSelectedPointIds(availablePoints.filter((p: any) => !selectedPointIds.includes(p.id)).map((p: any) => p.id));
                    }}>反选</Button>
                    <Divider type="vertical" />
                    <Button size="small" onClick={() => {
                      const name = prompt('模板名称（用于保存当前选择）：');
                      if (name) {
                        const tmpls = JSON.parse(localStorage.getItem('water_point_templates') || '{}');
                        tmpls[name] = { wtId: selectedWt, pointIds: selectedPointIds };
                        localStorage.setItem('water_point_templates', JSON.stringify(tmpls));
                        setTemplateVersion(v => v + 1);
                        message.success(`模板「${name}」已保存`);
                      }
                    }}>保存模板</Button>
                    {templateKeys.length > 0 && (
                      <Select
                        size="small" placeholder="加载模板" style={{ width: 130 }}
                        value={undefined}
                        onChange={name => {
                          if (!name) return;
                          const tmpls = JSON.parse(localStorage.getItem('water_point_templates') || '{}');
                          const tmpl = tmpls[name];
                          if (tmpl) {
                            if (tmpl.wtId === selectedWt) {
                              setSelectedPointIds(tmpl.pointIds.filter((id: number) => availablePoints.some((p: any) => p.id === id)));
                              message.success(`已加载模板「${name}」`);
                            } else {
                              message.warning('模板水样类型不匹配');
                            }
                          }
                        }}
                        options={templateKeys.map(k => ({ label: k, value: k }))}
                      />
                    )}
                    {templateKeys.length > 0 && (
                      <Select
                        size="small" placeholder="删除模板" style={{ width: 130 }}
                        value={undefined}
                        onChange={name => {
                          if (!name) return;
                          const tmpls = JSON.parse(localStorage.getItem('water_point_templates') || '{}');
                          if (tmpls[name]) {
                            delete tmpls[name];
                            localStorage.setItem('water_point_templates', JSON.stringify(tmpls));
                            setTemplateVersion(v => v + 1);
                            message.success(`模板「${name}」已删除`);
                          }
                        }}
                        options={templateKeys.map(k => ({ label: `删除: ${k}`, value: k }))}
                      />
                    )}
                  </Space>
                </div>
                {filteredPoints.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>无匹配的采样点</Typography.Text>
                ) : (
                <Checkbox.Group
                  value={selectedPointIds}
                  onChange={v => setSelectedPointIds(v as number[])}
                  style={{ width: '100%' }}
                >
                  {areaGroups.size > 1 ? (
                    <Collapse
                      defaultActiveKey={[...areaGroups.keys()]}
                      size="small"
                      ghost
                      style={{ background: 'transparent' }}
                      items={[...areaGroups.entries()].map(([area, pts]) => ({
                        key: area,
                        label: (
                          <Space size={4}>
                            <Tag color={AREA_COLORS[area] || 'default'} style={{ borderRadius: 4, fontSize: 11 }}>{area}</Tag>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                              {pts.filter((p: any) => selectedPointIds.includes(p.id)).length}/{pts.length}
                            </span>
                          </Space>
                        ),
                        extra: (
                          <Space size={4} onClick={e => e.stopPropagation()}>
                            <Button size="small" type="link" style={{ fontSize: 11 }} onClick={() => {
                              const ids = pts.map((p: any) => p.id);
                              setSelectedPointIds(prev => [...new Set([...prev, ...ids])]);
                            }}>全选</Button>
                            <Button size="small" type="link" style={{ fontSize: 11 }} onClick={() => {
                              const ids = new Set(pts.map((p: any) => p.id));
                              setSelectedPointIds(prev => prev.filter(id => !ids.has(id)));
                            }}>清空</Button>
                          </Space>
                        ),
                        children: (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingLeft: 8 }}>
                            {pts.map((pt: any) => (
                              <Checkbox key={pt.id} value={pt.id} style={{ fontSize: 13 }}>
                                {pt.name}
                              </Checkbox>
                            ))}
                          </div>
                        ),
                      }))}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                      {filteredPoints.map((pt: any) => (
                        <Checkbox key={pt.id} value={pt.id} style={{ fontSize: 13 }}>
                          <Tag color={AREA_COLORS[pt.area] || 'default'} style={{ borderRadius: 4, fontSize: 10, marginRight: 4 }}>{pt.area}</Tag>
                          {pt.name}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                </Checkbox.Group>
                )}
              </div>
            );
          })()}
        </Card>
      )}

      {/* Record Info Bar (collapsible) */}
      {record && (
        <Card size="small" style={{ borderRadius: 10, marginBottom: 16, background: '#f8fafc', border: '1px solid #e8ecf1' }}
          bodyStyle={{ padding: recordInfoExpanded ? '12px 16px' : '6px 16px' }}>
          {recordInfoExpanded ? (
            <Descriptions size="small" column={7} colon={false}>
              <Descriptions.Item label="报告编号"><Typography.Text code>{record.record_no}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="状态">{STATUS_MAP[record.status]?.label || record.status}</Descriptions.Item>
              <Descriptions.Item label="水样类型">{waterTypes.find(w => w.id === record.water_type_id)?.name}</Descriptions.Item>
              <Descriptions.Item label="执行标准">{waterTypes.find(w => w.id === record.water_type_id)?.standard_code}</Descriptions.Item>
              <Descriptions.Item label="化验日期">{record.test_date}</Descriptions.Item>
              <Descriptions.Item label="报告日期">{record.report_date}</Descriptions.Item>
              <Descriptions.Item label="化验员">{record.tester}</Descriptions.Item>
              <Descriptions.Item label="审核人">{record.reviewer || '—'}</Descriptions.Item>
            </Descriptions>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Typography.Text code style={{ fontSize: 12 }}>{record.record_no}</Typography.Text>
              <Tag color={record.status === 'draft' ? 'default' : record.status === 'submitted' ? 'processing' : record.status === 'reviewed' ? 'success' : 'warning'} style={{ fontSize: 11 }}>
                {STATUS_MAP[record.status]?.label || record.status}
              </Tag>
              <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>{waterTypes.find(w => w.id === record.water_type_id)?.name} | 化验: {record.test_date} | 报告: {record.report_date} | 化验员: {record.tester}</Typography.Text>
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
                          const incomplete = areaPts.find(p => { const s = getRowStatus(p.sample_point_id); return s !== 'complete' && s !== 'abnormal'; });
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
                          label: `${p.sample_point_name} (${getRowStatus(p.sample_point_id) === 'complete' ? '✓' : getRowStatus(p.sample_point_id) === 'abnormal' ? '⚠' : getRowStatus(p.sample_point_id) === 'partial' ? '◐' : '○'})`,
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
                  const done = allPoints.filter(p => p.sample_point_area === a && (getRowStatus(p.sample_point_id) === 'complete' || getRowStatus(p.sample_point_id) === 'abnormal')).length;
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
                            <Space size={6} align="center">
                              {pointPhotos.map(p => (
                                <div key={p.id} style={{ position: 'relative', display: 'inline-block' }}>
                                  <img
                                    src={p.url}
                                    alt={p.original_name || ''}
                                    style={{
                                      width: 48, height: 48, objectFit: 'cover',
                                      borderRadius: 6, cursor: 'pointer', border: '1px solid #e8ecf1',
                                    }}
                                    onClick={() => { setPreviewImage(p.url); setPreviewOpen(true); }}
                                  />
                                  {isEditable && (
                                    <DeleteOutlined
                                      style={{
                                        position: 'absolute', top: -6, right: -6,
                                        fontSize: 12, color: '#ff4d4f', cursor: 'pointer',
                                        background: '#fff', borderRadius: '50%', padding: 2,
                                      }}
                                      onClick={e => { e.stopPropagation(); handleDeletePhoto(p.id); }}
                                    />
                                  )}
                                </div>
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
            scroll={{ x: 350 + indicators.length * 120, y: 'calc(100vh - 480px)' }}
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
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          }}>
            <Space size="small" wrap>
              <Progress percent={Math.round(filledCells / (totalPoints * indicators.length) * 100)} size="small" style={{ width: 80 }}
                strokeColor={abnormalItems.length > 0 ? '#faad14' : '#52c41a'} />
              <Typography.Text
                style={{ fontSize: 12, color: filledPoints < totalPoints ? '#0891b2' : '#64748b', cursor: filledPoints < totalPoints ? 'pointer' : 'default', textDecoration: filledPoints < totalPoints ? 'underline' : 'none', whiteSpace: 'nowrap' }}
                onClick={() => {
                  if (filledPoints >= totalPoints) return;
                  if (viewMode === 'single') {
                    const next = allPoints.find(p => { const s = getRowStatus(p.sample_point_id); return s !== 'complete' && s !== 'abnormal' && p.sample_point_id !== singlePointId; });
                    if (next) { setSinglePointId(next.sample_point_id); if (next.sample_point_area !== activeArea) setActiveArea('all'); }
                  } else {
                    const next = allPoints.find(p => { const s = getRowStatus(p.sample_point_id); return s !== 'complete' && s !== 'abnormal'; });
                    if (next?.sample_point_area && next.sample_point_area !== activeArea) setActiveArea(next.sample_point_area);
                  }
                }}
              >
                <CheckCircleOutlined style={{ color: filledPoints >= totalPoints ? '#52c41a' : '#0891b2' }} /> {filledPoints}/{totalPoints} 采样点
                {filledPoints < totalPoints && ' → 跳转未填报'}
              </Typography.Text>
              {abnormalPoints > 0 && (
                <Typography.Text style={{ fontSize: 12, color: '#ff4d4f', whiteSpace: 'nowrap' }}>
                  <ExclamationCircleOutlined /> {abnormalPoints} 个超标
                </Typography.Text>
              )}
              <Button type="link" size="small" onClick={() => setLegendExpanded(!legendExpanded)} style={{ fontSize: 11, padding: 0 }}>
                {legendExpanded ? '收起图例 ▲' : '图例 ▶'}
              </Button>
            </Space>
            <Space size="middle">
              {isEditable && record && (
                <Typography.Text style={{ fontSize: 11 }}>
                  {autoSaveStatus === 'saving' ? (
                    <span style={{ color: '#1677ff' }}><InfoCircleOutlined spin /> 保存中...</span>
                  ) : autoSaveStatus === 'saved' ? (
                    <span style={{ color: '#52c41a' }}><CheckCircleOutlined /> 已保存 {lastSaved}</span>
                  ) : autoSaveStatus === 'unsaved' ? (
                    <span style={{ color: '#faad14' }}><ExclamationCircleOutlined /> 未保存</span>
                  ) : null}
                </Typography.Text>
              )}
              {isEditable && (
                <Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
                  <InfoCircleOutlined /> Tab 跳格 · Enter 换行 · 点击列头一键填充{isFullscreen ? ' · Esc 退出全屏' : ''}
                </Typography.Text>
              )}
            </Space>
          </div>
          {/* Legend expand */}
          {legendExpanded && (
            <div style={{ marginTop: 4, padding: '6px 14px', background: '#f8fafc', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
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

          {/* Conclusion — always visible when record exists */}
          {record && (
            <div style={{ marginTop: 20 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>结论与备注</Typography.Text>
              <Input.TextArea
                value={conclusion}
                onChange={e => { setConclusion(e.target.value); setConclusionEdited(true); setAutoSaveStatus('unsaved'); }}
                placeholder={abnormalItems.length > 0 ? '说明超标原因及整改措施...' : '本次检测项目全部合格'}
                rows={2}
                disabled={record?.status === 'reviewed'}
                style={{ marginTop: 8, borderRadius: 8 }}
              />
            </div>
          )}

          {/* 签名行 */}
          {record && (
            <div style={{ marginTop: 16, fontSize: 13, color: '#475569' }}>
              <span>化验员：{record.tester}</span>
              <span style={{ margin: '0 32px' }}></span>
              <span>审核人：{record.reviewer || '___________'}</span>
              <span style={{ margin: '0 32px' }}></span>
              <span>日期：{record.report_date}</span>
            </div>
          )}

          {/* 现场照片 — visible for all records */}
          {record && (
            <div style={{ marginTop: 24 }}>
              <Divider style={{ margin: '0 0 12px 0' }} />
              <Space style={{ marginBottom: 12 }}>
                <PictureOutlined style={{ fontSize: 16, color: '#1677ff' }} />
                <Typography.Text strong style={{ fontSize: 14 }}>现场照片</Typography.Text>
                {(() => {
                  const total = Object.values(photos).flat().length;
                  return total > 0 ? <Tag style={{ borderRadius: 10 }}>{total} 张</Tag> : null;
                })()}
              </Space>

              {(() => {
                const allPhotoEntries = Object.entries(photos);
                const hasAnyPhotos = allPhotoEntries.some(([, arr]) => arr.length > 0);
                const ptsWithPhotos = allPhotoEntries.filter(([, arr]) => arr.length > 0);
                const ptsEditable = isEditable ? allPoints.filter(p => !ptsWithPhotos.some(([spId]) => parseInt(spId) === p.sample_point_id)) : [];

                if (!hasAnyPhotos && !isEditable) {
                  return <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无现场照片</Typography.Text>;
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Points with photos */}
                    {ptsWithPhotos.map(([spId, ptPhotos]) => {
                      const spName = allPoints.find(p => p.sample_point_id === parseInt(spId))?.sample_point_name || `点位${spId}`;
                      return (
                        <div key={spId} style={{
                          padding: '10px 14px', background: '#f8fafc',
                          borderRadius: 10, border: '1px solid #e8ecf1',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Typography.Text strong style={{ fontSize: 13 }}>{spName}</Typography.Text>
                            {isEditable && (
                              <Button size="small" type="dashed" icon={<CameraOutlined />}
                                onClick={() => handleUploadPhoto(parseInt(spId))}
                                style={{ borderRadius: 6, fontSize: 11 }}>拍照</Button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {ptPhotos.map((p: any) => (
                              <div key={p.id} style={{ position: 'relative', display: 'inline-block' }}>
                                <img
                                  src={p.url}
                                  alt={p.original_name || ''}
                                  style={{
                                    width: 96, height: 72, objectFit: 'cover',
                                    borderRadius: 8, cursor: 'pointer', border: '1px solid #e8ecf1',
                                    transition: 'transform 0.15s',
                                  }}
                                  onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'scale(1.05)'; }}
                                  onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
                                  onClick={() => { setPreviewImage(p.url); setPreviewOpen(true); }}
                                />
                                {isEditable && (
                                  <DeleteOutlined
                                    style={{
                                      position: 'absolute', top: -6, right: -6,
                                      fontSize: 12, color: '#ff4d4f', cursor: 'pointer',
                                      background: '#fff', borderRadius: '50%', padding: 2,
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                    }}
                                    onClick={e => { e.stopPropagation(); handleDeletePhoto(p.id); }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* Points without photos (editable) — compact upload row */}
                    {ptsEditable.length > 0 && hasAnyPhotos && (
                      <div style={{
                        padding: '6px 14px', borderRadius: 10, border: '1px dashed #d9d9d9',
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>其他点位：</Typography.Text>
                        {ptsEditable.map(p => (
                          <Button key={p.sample_point_id} size="small" icon={<CameraOutlined />}
                            onClick={() => handleUploadPhoto(p.sample_point_id)}
                            style={{ borderRadius: 6, fontSize: 11 }}>{p.sample_point_name}</Button>
                        ))}
                      </div>
                    )}
                    {/* Empty state when no photos at all but editable */}
                    {!hasAnyPhotos && isEditable && (
                      <div style={{
                        padding: '24px 0', textAlign: 'center',
                        background: '#fafafa', borderRadius: 10, border: '1px dashed #d9d9d9',
                      }}>
                        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
                          暂无现场照片，请选择采样点上传
                        </Typography.Text>
                        <Space wrap style={{ justifyContent: 'center' }}>
                          {allPoints.slice(0, 8).map(p => (
                            <Button key={p.sample_point_id} size="small" icon={<CameraOutlined />}
                              onClick={() => handleUploadPhoto(p.sample_point_id)}
                              style={{ borderRadius: 6 }}>{p.sample_point_name}</Button>
                          ))}
                          {allPoints.length > 8 && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              ...等 {allPoints.length} 个点位
                            </Typography.Text>
                          )}
                        </Space>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </Card>
        </div>
      )}

      {/* OCR Review Modal */}
      <Modal
        title="拍照识别结果"
        open={ocrModalOpen}
        onCancel={() => { setOcrModalOpen(false); setOcrResult(null); setOcrEditedResult(null); setOcrError(''); }}
        width={900}
        footer={ocrResult ? [
          <Button key="cancel" onClick={() => { setOcrModalOpen(false); setOcrResult(null); setOcrEditedResult(null); }}>取消</Button>,
          <Button key="fill" type="primary" onClick={handleOcrFill} icon={<ThunderboltOutlined />}>一键填充到表格</Button>,
        ] : null}
        maskClosable={!ocrLoading}
      >
        {ocrLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>正在识别检测报告，请稍候...</Typography.Text>
          </div>
        )}

        {ocrError && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CloseCircleOutlined style={{ fontSize: 40, color: '#ff4d4f' }} />
            <Typography.Text type="danger" style={{ display: 'block', marginTop: 12 }}>{ocrError}</Typography.Text>
          </div>
        )}

        {ocrEditedResult && !ocrLoading && (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              请核对识别结果，修改后点击"一键填充到表格"。注意：空白单元格不会被填充。
            </Typography.Text>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f0f5fa' }}>
                  <th style={ocrThStyle}>采样点</th>
                  {indicators.map(ind => (
                    <th key={ind.id} style={ocrThStyle}>{ind.name}<br /><span style={{ fontSize: 10, color: '#94a3b8' }}>({ind.unit || '-'})</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ocrEditedResult).map(([ptName, values]) => (
                  <tr key={ptName}>
                    <td style={ocrTdStyle}><Typography.Text strong style={{ fontSize: 12 }}>{ptName}</Typography.Text></td>
                    {indicators.map(ind => (
                      <td key={ind.id} style={ocrTdStyle}>
                        <Input
                          size="small"
                          value={values[ind.name] || ''}
                          onChange={e => {
                            setOcrEditedResult(prev => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                [ptName]: { ...prev[ptName], [ind.name]: e.target.value },
                              };
                            });
                          }}
                          style={{ width: 80, textAlign: 'center', fontSize: 12 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        open={previewOpen}
        footer={null}
        onCancel={() => { setPreviewOpen(false); setPreviewImage(''); }}
        width="auto"
        style={{ maxWidth: '90vw', top: 20 }}
        styles={{ body: { padding: 8, display: 'flex', justifyContent: 'center' } }}
      >
        <img src={previewImage} alt="" style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }} />
      </Modal>

      {/* Add Point Modal */}
      <Modal
        title="添加采样点"
        open={addPointModalOpen}
        onCancel={() => setAddPointModalOpen(false)}
        footer={null}
        width={500}
      >
        {allActivePoints.length === 0 ? (
          <Typography.Text type="secondary">当前水样类型下没有更多可用采样点</Typography.Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflow: 'auto' }}>
            {allActivePoints.map((p: any) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 8, border: '1px solid #e8ecf1',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => handleAddPoint(p.id)}
              >
                <div>
                  <Typography.Text strong style={{ fontSize: 13 }}>{p.name}</Typography.Text>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {p.area && <Tag color={AREA_COLORS[p.area] || 'default'} style={{ borderRadius: 4, fontSize: 10, marginRight: 6 }}>{p.area}</Tag>}
                    {p.code && <Typography.Text code style={{ fontSize: 10 }}>{p.code}</Typography.Text>}
                  </div>
                </div>
                <PlusOutlined style={{ color: '#1677ff' }} />
              </div>
            ))}
          </div>
        )}
      </Modal>

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
