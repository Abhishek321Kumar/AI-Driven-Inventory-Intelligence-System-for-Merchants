---
name: Mercura AI
description: 4K Executive FinTech & Working Capital Intelligence Workspace
colors:
  primary: "#0EA5A0"
  primary-glow: "#E6F7F5"
  primary-dark: "#0B1F2A"
  primary-hover: "#0C8E89"
  gold: "#D4AF37"
  gold-light: "#F3E5AB"
  gold-hover: "#E5C158"
  neutral-bg: "#F8F8F6"
  surface-card: "#FFFFFF"
  canvas-dark-start: "#111827"
  canvas-dark-mid: "#202B3A"
  canvas-dark-warm: "#3B352B"
  text-charcoal: "#1F2937"
  text-muted: "#94A3B8"
  danger: "#EF4444"
  warning: "#F59E0B"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontWeight: 800
  body:
    fontFamily: "Inter, sans-serif"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontWeight: 600
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  btn-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.md}"
    padding: "14px 28px"
  btn-teal:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "14px 24px"
---

# Design System

## Overview
Mercura AI is an executive-tier FinTech workspace built for merchants to manage stock and working capital. The aesthetic marries deep atmospheric luxury navy (`#0B1F2A`), precision royal teal (`#0EA5A0`), and institutional metallic gold (`#D4AF37`) over a warm cream canvas (`#F8F8F6`).

## Colors
- **Deep Navy (`#0B1F2A`, `#102A3A`, `#07141C`):** Institutional grounding color used for the global navigation sidebar, executive hero banners, and dark frosted telemetry cards.
- **Royal Teal (`#0EA5A0`):** Core brand accent representing healthy stock, active POS sync, capital safety, and primary actions.
- **Soft Teal Glow (`#E6F7F5`):** Subtle ambient surface illumination for active badges and light glassmorphic highlights.
- **Metallic Gold (`#D4AF37`, `#F3E5AB`):** High-priority executive emphasis, primary CTA highlights, and forecast reliability indicators.
- **Warm Cream (`#F8F8F6`, `#EFECE6`):** Workspace stage canvas background replacing clinical stark white with breathable physical paper warmth.
- **Risk Colors:** Red Alert (`#EF4444`) for dead stock and locked capital; Amber Warning (`#F59E0B`) for imminent stockouts and reorder thresholds.

## Typography
- **Display Headlines:** `Plus Jakarta Sans`, Extra Bold (800) to Black (900). Tight tracking (`tracking-tight`), crisp line-height.
- **Interface & Body Text:** `Inter`, Regular (400) to Semi-Bold (600). High contrast charcoal (`#1F2937`) on cream, crisp white/slate on navy.
- **Financial Telemetry & SKUs:** `JetBrains Mono` / system monospace. Tabular numerical alignment for currency figures (`₹4,85,000`), SKU IDs, and percentages.

## Layout
- **Fixed Navigation + Spacious Scrolling Workspace:** Left sidebar is fixed (`h-screen sticky top-0`) while the right content area flows with natural vertical scrolling (`overflow-y-auto`).
- **Breathing Room:** Minimum card gap of `1.5rem` to `2rem` (`gap-6` to `gap-8`). Never cram metrics into rigid viewport locks.
- **Responsive Stacking:** Grids adapt from 12-column executive desktop spans to stacked mobile layouts without truncated badges.

## Elevation & Depth
- **Frosted Glassmorphism:** Dark navy cards use `bg-[#0B1F2A]/90 backdrop-blur-xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.5)]`.
- **Light Stage Cards:** Crisp white cards use `bg-white/95 border border-[#0EA5A0]/15 shadow-[0_8px_24px_-6px_rgba(11,31,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]`.
- **Tactile Paper Grain:** 4K SVG fractal noise filter overlay (`#noise4k`) provides physical texture and eliminates flat digital sterileness.

## Shapes
- **Corner Radii:** Cards use generous `rounded-2xl` (16px) or `rounded-3xl` (24px).
- **Badges & Pills:** Stadium pill capsules (`rounded-full`) for live telemetry and status indicators.
- **Interactive Buttons:** `rounded-xl` with tactile scale feedback (`hover:scale-[1.02] active:scale-[0.98]`).

## Components
- **Curved Slogan Border Hero:** Storefront illustration framed with continuous 360° rotating SVG text path border in metallic gold (`#D4AF37`).
- **Capital Guardrail Card:** Frosted telemetry badge with live pulsing beacon, shield icon, and tabular currency values.
- **Multi-Format Ingestion Modal:** 3-mode ingestion interface (CSV/XLSX file drag-and-drop, Invoice Image OCR, Adaptive Manual Entry).
- **Reactive Financial Graphs:** Multi-layered cubic-bezier spline charts with institutional gridlines and vertical velocity bars.

## Do's and Don'ts
- **DO** always display tangible rupee figures (`₹`) alongside percentages.
- **DO** pair every risk diagnosis with an explicit `SUGGESTED MERCHANT ACTION`.
- **DO** use monospace font for all financial telemetry, SKU identifiers, and dates.
- **DON'T** auto-execute inventory purchases or reorders without explicit merchant sign-off.
- **DON'T** nest cards inside cards to create visual noise.
- **DON'T** let badges overlap or truncate on smaller viewports.
