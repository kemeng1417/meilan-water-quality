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

# 打包 exe（产出 dist/水质管理系统.exe）
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
    routers/        API 路由（auth/records/indicators/alerts/trends/export）
    services/       合规判定引擎、认证、Word 报告生成
  seed_data.py      种子数据（水样类型、指标、限值、采样点、用户）
  mock_data.py      模拟数据生成器
  run.py            一键启动脚本（open browser + uvicorn）

frontend/           React 18 + TypeScript + Ant Design 5 + ECharts
  src/
    theme/tokens.ts 设计 Token（颜色、水样类型色、区域色、状态映射）
    api/            Axios 客户端 + API 端点
    components/     AppLayout（侧边栏 + 页眉 + 面包屑）
    pages/          6 个功能页面
      Login.tsx        登录页
      Dashboard.tsx    首页看板
      DataEntry.tsx    数据填报（核心页面，~620 行）
      RecordList.tsx   记录列表
      TrendAnalysis.tsx 趋势分析
      AlertManagement.tsx 异常管理
      PointManagement.tsx 采样点管理
```

## 数据库核心关系

- `water_types` (id=1出厂水, 2末梢水, 3直饮水, 4出厂水+末梢水联合)
- `sample_points` — 每个点位绑定一个 water_type_id
- `indicators` — 9 项日检指标（肉眼可见物、浑浊度、色度、pH、COD、菌落总数、总大肠菌群、游离余氯、臭和味）
- `standard_limits` — 每种水样类型 × 每项指标的限值（min/max/qual_check）
- `test_records` — 检测报告（tester/reviewer/status/is_abnormal/rejection_reason）
- `test_details` — 报告明细（record_id + sample_point_id + indicator_id → value_text/value_num/is_qualified）
- `alert_records` — 超标自动创建，可录入整改措施

## 关键设计决策

- **合规判定** (`compliance.py`)：分三类 — 定性匹配（`qual_check` 如"不应检出"）、数值比较（min/max）、特殊处理（"合格"文字视为达标）
- **联合报告**（water_type_id=4）：创建时加载出厂水+末梢水两类点位，合规判定按各点位自身 water_type_id 的限值。指标和限值查询时，id=4 映射到 id=1（出厂水）的限值
- **报告编号规则**：`{前缀}-{日期}-{序号}` — CCS(出厂水)/MSS(末梢水)/ZYS(直饮水)/LH(联合)
- **状态流转**：draft → submitted → reviewed；reviewer 可 reject → rejected → 化验员修改 → submitted → reviewed
- **PyInstaller 路径**：frozen 模式下 DB 在 exe 同目录，前端静态文件在 `sys._MEIPASS/frontend/dist`

## 标准依据

- GB 5749-2022《生活饮用水卫生标准》（97 项，常规 43 + 扩展 54）
- CJ 94-2005《饮用净水水质标准》（38 项）
- GB/T 5750-2023《生活饮用水标准检验方法》（13 部分）

## 项目配置

- 前端开发端口：5173（Vite），代理 `/api` → `localhost:8000`
- 后端端口：8000
- DB 路径：开发模式 `backend/data/water_quality.db`，打包模式 `exe 同目录/data/`
- 默认用户：zhang/123456（化验员）、liwei/123456（审核人）、admin/admin123（管理员）
