# Asset Tag Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the border from asset panels and give every asset tag a stable, deterministic Ant Design color.

**Architecture:** Keep tag data unchanged in `AssetListPage`. A local pure helper hashes each tag string into a fixed Ant Design color palette; CSS scopes the border removal to assets rather than altering all panels.

**Tech Stack:** React 19, Ant Design 6, TypeScript, Vite.

## Global Constraints

- Do not modify API paths, API fields, routes, or asset data.
- The same tag text must always resolve to the same color.
- Use Ant Design `Tag` preset colors and do not use runtime randomness.
- Do not add frontend automated tests; verify with typecheck, build, and local preview.

---

### Task 1: Add stable tag colors and borderless asset panels

**Files:**
- Modify: `apps/web/src/features/assets/AssetListPage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `DataAsset.tags: string[]`.
- Produces: `getTagColor(tag: string): string` and an assets-only borderless panel rule.

- [ ] **Step 1: Add the deterministic color helper**

Define a fixed palette and sum character codes from each tag to choose an index with modulo arithmetic. Pass the result as the `color` property of each existing Ant Design `Tag`.

- [ ] **Step 2: Scope the border removal**

Add `.asset-page .panel { border-color: transparent; }` to `styles.css` without changing the shared `.panel` rule.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

Then visually confirm multiple distinct tags show stable preset colors and the asset panel has no visible border. Commit the two source files plus this specification and plan.
