# Atlas PRD v1 Decisions

Date: 2026-01-11
Source: Perplexity MCP research (`.taskmaster/reports/atlas-prd-decisions-research.md`)

## 1) Node Agent Language
**Decision:** Go
**Why:** Single static binary, lower memory footprint, strong concurrency, simpler deployment for daemon-style agents. Best fit for multi-device agents at v1 scale.

## 2) Control Plane Hosting Model
**Decision:** Single-process service (modular monolith)
**Why:** Fast iteration, simpler ops/debugging, fewer moving pieces. Design modules with clear boundaries to split later if needed.

## 3) Logging Storage (v1)
**Decision:** JSONL for append-only logging, with optional SQLite ingestion later
**Why:** High write throughput and simple append-only pipeline; DB ingestion can be layered for queries/analytics.

## 4) Minimum OS Targets (v1)
**Decision:** Linux kernel 4.x+ and Windows Server 2019+/Windows 10 1809+ (x86_64 primary)
**Why:** Modern baseline with broad coverage; avoids legacy support burden. ARM64 optional later.

## 5) Initial Device Roles Taxonomy (v1)
**Decision:** 5 categories
- Server
- Network Device
- Workstation
- Container Host
- IoT/Embedded

**Why:** Covers the majority of v1 monitoring scenarios with clear operational separation; extensible later.
