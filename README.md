# 美兰机场供水站水质管理系统

本地化的水质检测数据填报、合规判定、报告导出和异常管理系统，替代传统 Word 文档手工填报流程。

## 功能特性

- **数据填报** — 矩阵模式 / 逐点模式，支持批量粘贴、Tab/Enter 键盘导航、60s 自动保存、全屏填报、Undo/Redo
- **即时合规判定** — 录入时本地即时对照标准限值判定合格/超标，绿/红底色标记，无需等保存
- **采样点快速选择** — 按区域分组折叠、搜索过滤、全选/反选/清空、模板保存/加载/删除
- **报告导出** — Word、Excel、HTML、PDF 四种格式，照片内嵌，联合报告双限值
- **趋势分析** — 双 Y 轴折线/柱状图，dataZoom 缩放，异常点标记，数据明细表
- **异常管理** — 超标自动创建告警，支持整改变措施录入和跟踪
- **采样点管理** — 点位 CRUD、启用/停用、按区域分组、使用统计
- **审核流程** — 化验员填报 → 提交审核 → 审核人通过/打回，支持结论自动生成
- **首页看板** — 今日概况、本月达标率、超标指标分布、近 7 天趋势

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python 3.12 + FastAPI |
| 数据库 | SQLite (SQLAlchemy 2.0 ORM) |
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts |
| 构建工具 | Vite |
| 报表生成 | python-docx / openpyxl / WeasyPrint |
| 部署方式 | 本地 Web 服务 + 浏览器访问 |

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+
- 操作系统：Windows 10/11（也可在 macOS/Linux 运行）

### 安装与启动

```bash
# 1. 克隆仓库
git clone <repo-url>
cd 水质管理系统

# 2. 安装后端依赖
cd backend
pip install -r requirements.txt

# 3. 启动后端（自动建库并初始化种子数据）
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. 安装前端依赖（新终端）
cd frontend
npm install

# 5. 启动前端开发服务器（可选，开发时使用）
npm run dev

# 6. 构建前端（生产部署时使用）
npm run build
```

启动后浏览器访问 `http://localhost:8000` 即可使用。

### 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 主管（全部权限） |
| huayan | 123456 | 化验员（填报+审核） |

## 项目结构

```
水质管理系统/
├── backend/                    # Python 后端
│   ├── app/
│   │   ├── main.py             # FastAPI 入口，lifespan 自动建表+种子数据
│   │   ├── config.py           # 路径解析（兼容 PyInstaller 打包）
│   │   ├── database.py         # SQLAlchemy 引擎与会话
│   │   ├── models/             # ORM 模型（8 张表）
│   │   ├── schemas/            # Pydantic 数据校验
│   │   ├── routers/            # API 路由
│   │   │   ├── auth.py         # 用户认证
│   │   │   ├── records.py      # 检测记录 CRUD + 合规判定
│   │   │   ├── indicators.py   # 指标/点位/限值管理
│   │   │   ├── alerts.py       # 异常告警管理
│   │   │   ├── trends.py       # 趋势数据
│   │   │   ├── export.py       # Word/Excel/HTML/PDF 导出
│   │   │   └── photos.py       # 照片上传
│   │   └── services/           # 业务逻辑
│   │       ├── compliance.py   # 合规判定引擎
│   │       └── report_gen.py   # 报告生成（Word + HTML）
│   ├── data/                   # SQLite 数据库 + 照片存储
│   ├── seed_data.py            # 种子数据（水样类型/指标/限值/点位/用户）
│   ├── mock_data.py            # 模拟数据生成器
│   └── requirements.txt
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── api/                # Axios 客户端 + API 端点
│   │   ├── components/         # AppLayout（侧边栏 + 页眉）
│   │   ├── pages/
│   │   │   ├── Login.tsx       # 登录页
│   │   │   ├── Dashboard.tsx   # 首页看板
│   │   │   ├── DataEntry.tsx   # 数据填报（核心页面）
│   │   │   ├── RecordList.tsx  # 记录列表
│   │   │   ├── TrendAnalysis.tsx    # 趋势分析
│   │   │   ├── AlertManagement.tsx  # 异常管理
│   │   │   ├── PointManagement.tsx  # 采样点管理
│   │   │   └── UserManagement.tsx   # 人员管理（仅主管可见）
│   │   └── theme/tokens.ts     # 设计 Token
│   ├── package.json
│   └── vite.config.ts
└── CLAUDE.md                   # Claude Code 开发指引
```

## 数据库模型

| 表 | 说明 |
|----|------|
| water_types | 水样类型（出厂水/末梢水/直饮水/联合报告） |
| sample_points | 采样点位（30+ 个点位，含直饮机） |
| indicators | 检测指标（日检 9 项） |
| standard_limits | 标准限值（三种水样类型 × 九项指标的限值规则） |
| test_records | 检测记录主表 |
| test_details | 检测明细（记录 × 点位 × 指标） |
| alert_records | 超标告警记录 |
| photos | 照片（超标项现场拍照） |

## 合规判定

系统内置三类判定逻辑，覆盖 GB 5749-2022 和 CJ 94-2005 标准：

- **定性判定** — 如"不应检出"、"无异臭、异味"，匹配文本
- **数值判定** — 如浑浊度 ≤ 1 NTU、pH 6.5-8.5，比较数值范围
- **特殊处理** — COD 等指标填"合格"视为达标

## 报告编号规则

| 前缀 | 水样类型 |
|------|----------|
| CCS | 出厂水 |
| MSS | 末梢水 |
| ZYS | 直饮水 |
| LH | 出厂水+末梢水（联合报告） |

格式：`{前缀}-{YYYYMMDD}-{序号}`，如 `CCS-20260519-001`

## 数据备份

SQLite 数据库文件位于 `backend/data/water_quality.db`，定期复制此文件即可完成备份。

## 打包分发

```bash
cd backend
pip install pyinstaller
python build_exe.py
```

打包后 exe 位于 `dist/水质管理系统.exe`，双击即可运行。
