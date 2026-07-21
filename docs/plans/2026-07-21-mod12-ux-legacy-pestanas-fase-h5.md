# MOD12 H5 — UX legacy — Implementation Plan

> **For agentic workers:** Implement D-H5-01…05. No backend.

**Goal:** Cerrar H5 — MovementsWorkspace, WriteOff form in WriteOffsPanel, zero native selects in inventory/.

**Architecture:** Shell InventoryClient keep API handlers; workspaces own UI.

---

- [ ] MovementsWorkspace + spec
- [ ] WriteOff request section in WriteOffsPanel
- [ ] AssetLoansPanel + UsefulLifeAlertsPanel → Select
- [ ] Slim InventoryClient tabs
- [ ] Portal tests + E2E smoke
