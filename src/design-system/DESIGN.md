---
name: Warm Social Appetite
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#5b403a'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#8f7069'
  outline-variant: '#e4beb6'
  surface-tint: '#b72301'
  primary: '#b72301'
  on-primary: '#ffffff'
  primary-container: '#ff5733'
  on-primary-container: '#580c00'
  inverse-primary: '#ffb4a4'
  secondary: '#7e5700'
  on-secondary: '#ffffff'
  secondary-container: '#feb300'
  on-secondary-container: '#6a4800'
  tertiary: '#006c49'
  on-tertiary: '#ffffff'
  tertiary-container: '#00a673'
  on-tertiary-container: '#003220'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3d0600'
  on-primary-fixed-variant: '#8c1800'
  secondary-fixed: '#ffdeac'
  secondary-fixed-dim: '#ffba38'
  on-secondary-fixed: '#281900'
  on-secondary-fixed-variant: '#604100'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '800'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system drives a playful, high-velocity decision-making experience for pairs deciding what to eat. The aesthetic balances culinary joy, warm sociability, and immediate tactile clarity to eliminate mealtime indecision. 

The visual style blends modern soft-tactile UI with micro-editorial food polish:
- **Atmosphere:** Sunlit, inviting, and appetizing—avoiding sterile utility in favor of warm comfort.
- **Personality:** Decisive, bubbly, empathetic, and shared.
- **Visual Mechanics:** Ultra-soft squircles, pill-shaped interaction anchors, buoyant touch targets, and golden-hour ambient drop shadows that treat content cards like plated courses.

## Colors

The palette revolves around food-inspired chromatic warmth set against creamy backdrops to sustain appetite and social cheer.

- **Primary (`#FF5733`):** Charred Coral / Searing Pepper. Used for hero interactive targets, high-priority matches, and primary swipe actions.
- **Secondary (`#FFB300`):** Melted Honey / Cheddar Amber. Deployed for celebration states, mutual affinity cues, streak badges, and spotlight tags.
- **Tertiary (`#10B981`):** Crisp Basil / Garden Herb. Reserved for dietary approvals, agreement markers, "It's a Match!" moments, and healthy dietary tags.
- **Neutral Surface (`#FDF8F5` to `#FFFDF9`):** Cultured Butter / Milky Cream. Replaces stark digital whites with an organic, appetizing canvas that prevents eye fatigue.
- **Neutral Typography (`#1E293B` to `#0F172A`):** Deep Roasted Slate. Delivers crisp legibility and high contrast without the clinical harshness of pitch black.

## Typography

Typography relies on **Plus Jakarta Sans** across all levels, utilizing its friendly, open apertures and geometric curves to express an energetic tone.

- **Headlines & Display:** Expressive weight (`700` and `800`) with tight letter-spacing for punchy dish titles, paired voting questions, and celebratory match headlines.
- **Body:** Anchored at medium (`500`) weight rather than normal (`400`) to sustain legibility over warm tinted surfaces and against photography overlays.
- **Labels & Micro-Tags:** High-contrast weights (`700` to `800`) with wide tracking for glanceable dietary categories, partner vote states, and distance metrics.

## Layout & Spacing

The layout is built mobile-first around rapid thumb reach and two-up comparison flows.

- **Grid Architecture:** 4-column fluid layout on mobile screens transitioning to an 8-column layout on tablets and 12 columns on desktop (capped at 640px max-width for social companion decision screens).
- **Rhythm & Touch:** Vertical rhythm strictly adheres to an 8pt base grid with a 48px minimum target size for quick decision taps.
- **Safe Margins:** Deep edge clearance ensures interactive pill dockbars, swipeable vote trays, and split partner status indicators never collide with system UI edges.

## Elevation & Depth

Visual depth avoids cold greys, relying on amber-tinted ambient glows and layered tonality that makes cards feel tangible:

- **Level 0 (Base):** Canvas tint `#FDF8F5` without shadow.
- **Level 1 (Subtle Stack / Filters / Micro-badges):** `0px 4px 12px rgba(255, 87, 51, 0.06), 0px 1px 3px rgba(30, 41, 59, 0.04)`.
- **Level 2 (Interactive Food Cards / Decision Decks):** `0px 12px 28px rgba(255, 87, 51, 0.10), 0px 2px 8px rgba(30, 41, 59, 0.04)`.
- **Level 3 (Match Modals / Bottom Sheets / Floating Bar):** `0px 20px 40px rgba(30, 41, 59, 0.12), 0px 8px 16px rgba(255, 87, 51, 0.08)`.

## Shapes

The interface embraces oversized rounded corners, squircle card geometries, and full capsule pill forms:

- **Containers & Deck Cards:** 24px to 32px squircle rounding creates a cuddly, organic feel that cradles culinary photography.
- **Buttons, Badges, and Chips:** Full capsule radii (`9999px`) provide tactile, pebble-like surfaces optimized for mobile swiping and tapping.
- **Input Fields & Overlays:** 20px curvature to match button and card relationships harmoniously.

## Components

### Buttons
- **Primary CTA:** Full pill (`rounded-full`), `#FF5733` fill, `#FFFFFF` text, bold `label-lg`. Elevated with a warm ambient shadow that slightly compresses upon press (`scale(0.97)`).
- **Secondary / Pass Action:** Full pill, `#FFFDF9` fill with a 2px outline in `#FF5733` or `#E2E8F0`, deep slate text.
- **Dual Vote Actions:** Oversized circular floating action buttons (64px x 64px) for rapid "Pass" (slate soft tint) and "Crave" (coral-orange fill with white icon).

### Chips & Mood Badges
- Capsule pills with 8px horizontal padding, 4px vertical padding.
- Selected state adopts solid `#FF5733` or `#FFB300` fills with crisp white text.
- Unselected states use milky white backgrounds with subtle slate borders (`#E2E8F0`).

### Decision Cards (Plates)
- Generous squircle border radius (28px) with internal edge padding of 16px.
- Full-bleed edge photography at the top with a soft internal gradient ramp leading to card metadata below.
- Subtle inner border (`1px solid rgba(255, 255, 255, 0.6)`) to provide separation over tinted backgrounds.

### Partner Sync Indicator (The "Two-To-Tango" Bar)
- Split header pill showing User A and User B live mood avatars.
- Pulse glow using `#10B981` whenever both users are actively voting simultaneously.

### Inputs & Selection Controls
- Text inputs utilize 20px rounded squircle borders, tinted background `#FFFFFF`, and an energetic `#FF5733` focus ring with a 4px soft bloom.
- Checkboxes and radios are styled as bouncy circular toggles featuring smooth squash-and-stretch spring transitions when active.