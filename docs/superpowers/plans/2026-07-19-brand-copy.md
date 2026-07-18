# NEXUS Brand Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic application title and footer with the NEXUS product identity, a runtime-generated copyright year, and the GitHub author name.

**Architecture:** Keep branding in `App`, the existing route layout component. Compute the calendar year during rendering, then interpolate it in the existing `Layout.Footer`; no routing, API behavior, request field, or feature-page changes are required.

**Tech Stack:** React 19, React Router 7, Ant Design 6, TypeScript, Vite.

## Global Constraints

- Do not modify Worker code, API clients, contracts, route declarations, business pages, request fields, or response-field handling.
- Change the visible header brand to exactly `NEXUS 数据智能平台`.
- Render the footer exactly as `© {current year} NEXUS 数据智能平台 · Created by vincent-xw · All Rights Reserved.`.
- Obtain the year in the browser at render time using `new Date().getFullYear()`; do not hard-code a year.
- Do not add or modify frontend automated tests for this visual copy change; use local visual verification plus typecheck and build.

---

### Task 1: Render NEXUS product branding

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: existing `App` route layout, Ant Design `Layout`, and browser `Date`.
- Produces: a NEXUS header brand and a dynamic copyright string in the existing footer.

- [ ] **Step 1: Update the rendered brand and footer copy**

In `App`, add the runtime year immediately after `const location = useLocation()`:

```tsx
const currentYear = new Date().getFullYear()
```

Replace the header heading and footer with:

```tsx
<h1 className="app-brand">NEXUS 数据智能平台</h1>
```

```tsx
<Layout.Footer className="app-footer">
  © {currentYear} NEXUS 数据智能平台 · Created by vincent-xw · All Rights Reserved.
</Layout.Footer>
```

- [ ] **Step 2: Run static and production-build verification**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

Expected: both commands exit with code 0.

- [ ] **Step 3: Perform local visual verification**

Run: `pnpm --filter @data-analyze/web exec vite --host 127.0.0.1`

Expected checks:

1. The dark header shows `NEXUS 数据智能平台` without wrapping.
2. The footer shows the current calendar year, `vincent-xw`, and `All Rights Reserved.`.
3. Existing navigation labels and targets stay unchanged.

- [ ] **Step 4: Commit the branding update**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): apply nexus brand copy"
```

### Task 2: Preserve the implementation handoff

**Files:**
- Create: `docs/superpowers/plans/2026-07-19-brand-copy.md`

**Interfaces:**
- Consumes: the approved brand-copy specification.
- Produces: a committed, executable record of the constrained UI change.

- [ ] **Step 1: Commit the implementation plan**

```bash
git add docs/superpowers/plans/2026-07-19-brand-copy.md
git commit -m "docs: add brand copy implementation plan"
```
