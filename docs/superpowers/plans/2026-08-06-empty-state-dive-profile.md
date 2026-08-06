# Empty-state dive-profile background — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace empty-state orbit rings with a barely-visible lived-in dive-profile SVG line.

**Architecture:** Presentational SVG behind `.empty-content`; CSS sizing only; no new data/runtime deps.

**Tech Stack:** React (DiveFrameApp EmptyState), CSS in `app/globals.css`

**Spec:** `docs/superpowers/specs/2026-08-06-empty-state-dive-profile-design.md`

---

### Task 1: Swap orbits for dive-profile SVG

**Files:**
- Modify: `app/DiveFrameApp.tsx` (EmptyState)
- Modify: `app/globals.css` (`.empty-orbit*` → `.empty-dive-profile`)

**Step 1: Replace markup**

In `EmptyState`, remove:

```tsx
<div className="empty-orbit orbit-one" />
<div className="empty-orbit orbit-two" />
```

Add an `aria-hidden` SVG with a lived-in depth profile path (descend → bottom undulation → safety-stop ledge → surface). Use stroke `rgba(141, 235, 215, 0.08)`, no fill, `vector-effect` / round caps as needed.

**Step 2: Replace CSS**

Remove `.empty-orbit`, `.orbit-one`, `.orbit-two`. Add `.empty-dive-profile` absolutely centered, ~80–90% width, mid-vertical, `pointer-events: none`, `z-index: 1` (content stays `z-index: 2`).

**Step 3: Visual check**

Load empty logbook (no dives / clear data) and confirm rings are gone, line is faint mid-screen, copy remains readable.

**Step 4: Commit**

```bash
git add app/DiveFrameApp.tsx app/globals.css
git commit -m "Replace empty-state orbits with a faint dive-profile line."
```
