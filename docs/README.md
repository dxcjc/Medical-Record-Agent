# Medical Record Agent — 文档目录

> 最后更新: 2026-06-22

## 目录结构

```
docs/
├── README.md                           # 本文档
├── HANDOVER.md                         # 项目交接文档(新成员入口)
├── KNOWN_ISSUES_AND_TODO.md            # 已知问题与待办跟踪(活跃)
├── V3问题诊断与设计反思报告.md            # V3 Schema 诊断与架构优化记录
│
├── architecture/                       # 架构文档(活跃)
│   ├── ARCHITECTURE_OPTIMIZATION_V2.md # V2 架构优化方案
│   └── multi-agent-architecture-design.md # 多智能体架构设计
│
├── bugfix/                             # Bug 修复记录
│   ├── BUGFIX-2026-06-17.md
│   ├── EVALUATION-DEBUG-GUIDE.md
│   └── EVALUATION-FIX-2026-06-17.md
│
├── archive/                            # 历史归档(已完成/过时)
│   ├── architecture/                   # 旧版架构设计
│   ├── optimization/                   # 多轮优化报告(V1-V4)
│   ├── reports/                        # 一次性评审报告
│   └── prd/                            # 待确认 PRD
│
└── *.json                              # 测试基线/Schema/字典文件
```

## 新成员阅读顺序

1. `HANDOVER.md` — 项目概览、架构、部署
2. `architecture/ARCHITECTURE_OPTIMIZATION_V2.md` — 当前架构
3. `KNOWN_ISSUES_AND_TODO.md` — 已知问题和优化方向
4. `V3问题诊断与设计反思报告.md` — 最新诊断结论
