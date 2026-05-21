# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

美兰机场供水站水质管理系统 — 本地化的水质检测数据填报、合规判定、报告生成和异常管理工具。替代原 Word 文档手工填报流程。

## 开发命令

```bash
# 后端启动（开发模式，自动建库并初始化种子数据）
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端开发（Vite dev server，API 代理到 localhost:8000）
cd frontend && npm run dev

# 前端构建（输出到 frontend/dist/，后端自动托管）
cd frontend && npm run build

# TypeScript 类型检查
cd frontend && npx tsc -b

# 生成模拟数据
cd backend && python mock_data.py

# 打包 exe（产出 dist/水质管理系统.exe + 启动水质管理系统.vbs + 快捷方式）
cd backend && python build_exe.py
```

## 技术架构

```
backend/            Python 3.12 + FastAPI + SQLAlchemy 2.0 + SQLite
  app/
    main.py         FastAPI 入口，lifespan 事件中 auto-create tables + seed
    config.py       DB/前端路径解析（兼容 PyInstaller frozen 模式）
    database.py     SQLAlchemy engine + session
    models/         ORM 模型（8 张表）
    schemas/        Pydantic 请求/响应校验
    routers/        API 路由（auth/records/indicators/alerts/trends/export/photos）
    services/       合规判定引擎、认证、Word/HTML 报告生成
  seed_data.py      种子数据（水样类型、指标、限值、采样点、用户）
  mock_data.py      模拟数据生成器
  run.py            一键启动脚本（open browser + uvicorn，frozen 模式重定向输出到文件）

frontend/           React 18 + TypeScript + Ant Design 5 + ECharts
  src/
    theme/tokens.ts 设计 Token（COLORS/WATER_TYPE_COLORS/AREA_COLORS/STATUS_MAP）
    api/            Axios 客户端 + 全部 API 端点
    components/     AppLayout（顶部水平导航栏 + 用户下拉菜单）
    pages/
      Login.tsx          登录页
      Dashboard.tsx      首页看板（4 统计卡片 + 近 7 天趋势 + 今日进度 + 超标排行）
      DataEntry.tsx      数据填报（核心页面，矩阵/逐点模式、IME 保护、Undo/Redo）
      RecordList.tsx     记录列表（搜索筛选、批量操作、展开预览、快捷审核）
      TrendAnalysis.tsx  趋势分析（双 Y 轴、dataZoom、异常标记、数据明细表格）
      AlertManagement.tsx 异常管理
      PointManagement.tsx 采样点管理（搜索、批量启停、使用统计）
      UserManagement.tsx 人员管理（仅主管可见）
```

## 数据库核心关系

- `water_types` (id=1 出厂水, 2 末梢水, 3 直饮水, 4 出厂水+末梢水联合)
- `sample_points` — 每个点位绑定一个 water_type_id，停用后不出现在新建报告中
- `indicators` — 9 项日检指标（肉眼可见物、浑浊度、色度、pH、COD、菌落总数、总大肠菌群、游离余氯、臭和味）
- `standard_limits` — 每种水样类型 × 每项指标的限值（min/max/qual_check）
- `test_records` — 检测报告（tester/reviewer/status/is_abnormal/conclusion/rejection_reason/report_date）
- `test_details` — 报告明细（record_id + sample_point_id + indicator_id → value_text/value_num/is_qualified）
- `alert_records` — 超标自动创建
- `photos` — 照片（record_id + sample_point_id → filename）

## 关键设计决策

- **合规判定** (`compliance.py`)：分三类 — 定性匹配（`qual_check`）、数值比较（min/max）、特殊处理（"合格"=达标）
- **联合报告**（water_type_id=4）：
  - 创建时加载出厂水+末梢水两类点位
  - 合规判定按各点位自身 water_type_id 的限值
  - 标准参考行加载两份限值，不同时显示 `出厂:≥0.3 末梢:≥0.05`
- **报告编号规则**：`{前缀}-{YYYYMMDD}-{序号}` — CCS(出厂水)/MSS(末梢水)/ZYS(直饮水)/LH(联合)
- **状态流转**：draft → submitted → reviewed；reviewer 可 reject → rejected → 化验员修改 → submitted
- **结论自动生成**：保存明细时自动生成结论（可手动编辑覆盖），清空后重新保存会重新生成
- **角色**：2 种 — tester（化验员，填报+审核）、admin（主管，所有权限+人员管理）
- **审核**：无角色限制，输入姓名即可审核；提交审核必须合并 status 和 conclusion 为一次调用
- **PyInstaller**：`--console` 打包 + VBS 脚本隐藏窗口 + Windows 快捷方式（最小化启动）
- **联合报告限值**：Word/Excel/HTML 导出和填报页面均支持双限值显示

## 导出与报告

- Word：python-docx，A4 横向，宋体小四，标准限值单行参考，照片内嵌（5cm宽）
- Excel：openpyxl，冻结表头，绿/红单元格标记合格/超标，照片文件名列表
- HTML：自包含 base64 图片，响应式打印样式，"打印为PDF"按钮
- PDF：Word COM 自动化转换，失败降级为 HTML

## 项目配置

- 前端开发端口：5173（Vite），代理 `/api` → `localhost:8000`
- 后端端口：8000
- DB 路径：开发模式 `backend/data/`，打包模式 `exe 同目录/data/`
- 种子账号：admin / admin123（主管）、huayan / 123456（化验员）
- PyInstaller 路径：frozen 模式下 DB 和 data 目录在 exe 同目录，前端在 `sys._MEIPASS/frontend/dist`
