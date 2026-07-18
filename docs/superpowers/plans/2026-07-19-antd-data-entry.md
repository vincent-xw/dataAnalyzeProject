# Ant Design Data and Form Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Web-native tables, buttons, and data-entry controls with Ant Design components while preserving every existing route, API request, request field, and business state transition.

**Architecture:** Each feature keeps its current local React state and API functions. View markup changes to `Table`, `Button`, `Form`, `Input`, `Select`, `Checkbox`, and `Upload`; dynamic preview records are converted to typed Ant Design column descriptors at the page boundary.

**Tech Stack:** React 19, React Router 7, Ant Design 6, TypeScript, Vite.

## Global Constraints

- Do not modify Worker code, API clients, contracts, API paths, request bodies, or response-field handling.
- Preserve all existing local state variable names, validation conditions, button copy, loading copy, and navigation targets.
- Use `Table` with `pagination={false}` for existing full tables and preview tables.
- `Upload` must use `beforeUpload={() => false}` so file selection never starts a new automatic upload request.
- Do not add frontend automated tests; run typecheck, build, and local visual verification.

---

### Task 1: Convert asset list and detail views

**Files:**
- Modify: `apps/web/src/features/assets/AssetListPage.tsx`
- Modify: `apps/web/src/features/assets/AssetDetailPage.tsx`

**Interfaces:**
- Consumes: `DataAsset`, `DataAssetPreview`, existing `apiRequest`, and existing local metadata state.
- Produces: `Table` views for asset records and previews, and `Form` controls for metadata without changing request payloads.

- [ ] **Step 1: Replace list markup with `Table` and the upload `Button`**

Use a `ColumnsType<DataAsset>` array with renderers for the current name/description, tag list, formatted date, and `Link` action. Use `useNavigate()` for the upload button and preserve `/assets/upload`.

- [ ] **Step 2: Replace metadata inputs and preview markup**

Use `Form layout="vertical" onFinish={saveMetadata}`, `Form.Item`, `Input`, `Input.TextArea`, `Button`, and a dynamically generated `ColumnsType<Record<string, unknown>>` for the preview. Change `saveMetadata` to take no submit event; leave its API request unchanged.

- [ ] **Step 3: Verify asset routes locally**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

Expected: both commands exit with code 0.

### Task 2: Convert upload and analysis creation views

**Files:**
- Modify: `apps/web/src/features/assets/AssetUploadPage.tsx`
- Modify: `apps/web/src/features/analyses/AnalysisListPage.tsx`
- Modify: `apps/web/src/features/analyses/AnalysisDetailPage.tsx`

**Interfaces:**
- Consumes: existing file, encoding, delimiter, selected asset, requirement, preview, and analysis state.
- Produces: Ant Design upload/select/checkbox/input/button controls and Ant Design preview/report tables.

- [ ] **Step 1: Replace upload data-entry controls**

Use `Form`, `Upload`, `Select`, and a loading `Button`. In `Upload.onChange`, set the existing `file` state from `info.file.originFileObj`; retain the exact existing `submit` request logic.

- [ ] **Step 2: Replace analysis data-entry controls and previews**

Use `Form`, `Checkbox`, `Select`, `Input.TextArea`, `Button`, and dynamically generated `Table` columns for each selected asset preview. Preserve `toggle`, `create`, `primaryAssetId`, and guidance behavior.

- [ ] **Step 3: Render table report widgets with `Table`**

For `widget.type === 'table'`, derive column keys from `detail.rows[0]`, use `Table` with `pagination={false}`, and retain the 50-row display limit.

### Task 3: Convert system settings and global visual rules

**Files:**
- Modify: `apps/web/src/features/settings/SystemSettingsPage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing prompt content, version history, and save/restore/activate callbacks.
- Produces: Ant Design form controls and CSS that no longer styles removed native table/button controls.

- [ ] **Step 1: Replace settings controls**

Use `Form`, `Input.TextArea`, `Button`, and `Space` while keeping the existing API callbacks unchanged.

- [ ] **Step 2: Remove conflicting native-control and table CSS**

Keep layout classes, preview scrolling, metadata layout, status chips, and responsive rules. Remove generic `button`, `input`, `select`, `textarea`, `table`, `th`, `td`, `.button-link`, and `.secondary-button` presentation rules that conflict with Ant Design.

- [ ] **Step 3: Verify every page locally and commit**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

Then start `pnpm --filter @data-analyze/web exec vite --host 127.0.0.1` and verify assets, upload, analyses, and settings. Commit only the feature files, global CSS, the updated spec, and this plan.
