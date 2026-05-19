/** 设计 Token —— 统一水蓝色工业风视觉系统 */

export const COLORS = {
  primary: '#0891b2',
  primaryDark: '#0e7490',
  primaryDeep: '#0c4a6e',
  primaryLight: '#7dd3fc',

  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',

  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textPlaceholder: '#cbd5e1',

  bgPage: '#f0f5fa',
  bgCard: '#ffffff',
  bgLight: '#f8fafc',
  bgSuccess: '#f6ffed',
  bgDanger: '#fff2f0',
  bgWarning: '#fffbe6',

  borderLight: '#e8ecf1',
  borderNormal: '#d9d9d9',

  shadowSm: '0 1px 2px rgba(0,0,0,0.03)',
  shadowMd: '0 1px 3px rgba(0,0,0,0.06)',
  shadowLg: '0 4px 12px rgba(0,0,0,0.1)',
} as const;

/** 水样类型标签色 */
export const WATER_TYPE_COLORS: Record<string, string> = {
  finished: '#1677ff',
  tap: '#52c41a',
  direct: '#0891b2',
  combined: '#0e7490',
};

/** 区域标签色 */
export const AREA_COLORS: Record<string, string> = {
  '一期供水站': '#1677ff',
  '二期供水站': '#722ed1',
  '一期航站楼': '#0891b2',
  '二期航站楼': '#0e7490',
  '一期停机坪': '#fa8c16',
  '二期停机坪': '#fa541c',
  '办公区': '#faad14',
};

/** 状态色映射 */
export const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft: { color: 'processing', label: '草稿' },
  submitted: { color: 'warning', label: '待审核' },
  reviewed: { color: 'success', label: '已审核' },
  rejected: { color: 'error', label: '已打回' },
};

/** 页面统一间距 */
export const SPACING = {
  pageTitleMb: 20,
  cardMb: 16,
  sectionGap: 24,
} as const;
