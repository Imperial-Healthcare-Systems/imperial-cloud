/**
 * Imperial Cloud — Hybrid Adaptive Theme Configuration
 *
 * TWO TOKEN LAYERS:
 *
 *  1. SHELL (static) — sidebar, navigation, branding. ALWAYS dark.
 *     These tokens never change with the theme. They are the brand identity.
 *     Prefixed `--ic-shell-*`.
 *
 *  2. WORKSPACE (adaptive) — dashboard, cards, tables, analytics, explorer
 *     content. Switches light/dark with the theme. Prefixed `--ic-ws-*`.
 *
 * The theme toggle ONLY swaps the workspace layer. The shell is constant.
 */

export type ThemeName = 'light' | 'dark'

// ── SHELL: permanent dark identity (never themed) ──────────────────────────
export const shell = {
  bg: '#07101F',
  surface: '#0B1426',
  elevated: '#111C31',
  elevatedHover: '#16233C',
  border: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.10)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#5A6B82',
  brand: '#1848C0',
  brandBright: '#186CE4',
  brandGlow: 'rgba(24,108,228,0.18)',
  brandRing: 'rgba(24,108,228,0.45)',
  brandMuted: 'rgba(24,108,228,0.14)',
  flame: '#F0A830',
  flameMuted: 'rgba(240,168,48,0.14)',
  glass: 'rgba(11,20,38,0.72)',
} as const

// ── WORKSPACE: adaptive surfaces (themed) ──────────────────────────────────
export interface WorkspaceTokens {
  bg: string; surface: string; elevated: string; elevatedHover: string
  border: string; borderStrong: string
  textPrimary: string; textSecondary: string; textTertiary: string
  brand: string; brandBright: string; brandHover: string
  brandGlow: string; brandRing: string; brandMuted: string
  flame: string; flameDeep: string; flameMuted: string
  success: string; error: string
  shadowResting: string; shadowLifted: string
}

export const workspace: Record<ThemeName, WorkspaceTokens> = {
  dark: {
    bg: '#040B18', surface: '#0B1426', elevated: '#111C31', elevatedHover: '#16233C',
    border: 'rgba(255,255,255,0.06)', borderStrong: 'rgba(255,255,255,0.11)',
    textPrimary: '#F8FAFC', textSecondary: '#94A3B8', textTertiary: '#5A6B82',
    brand: '#1848C0', brandBright: '#186CE4', brandHover: '#2E86E0',
    brandGlow: 'rgba(24,108,228,0.16)', brandRing: 'rgba(24,108,228,0.45)', brandMuted: 'rgba(24,108,228,0.12)',
    flame: '#F0A830', flameDeep: '#E49018', flameMuted: 'rgba(240,168,48,0.14)',
    success: '#34D399', error: '#F87171',
    shadowResting: '0 1px 2px rgba(0,0,0,0.5)', shadowLifted: '0 8px 32px rgba(0,0,0,0.55)',
  },
  light: {
    bg: '#F5F7FA', surface: '#FFFFFF', elevated: '#FCFCFD', elevatedHover: '#F1F4F8',
    border: 'rgba(15,23,42,0.08)', borderStrong: 'rgba(15,23,42,0.14)',
    textPrimary: '#0F172A', textSecondary: '#475569', textTertiary: '#94A3B8',
    brand: '#1B4DB3', brandBright: '#1A5FCC', brandHover: '#1551B5',
    brandGlow: 'rgba(26,95,204,0.10)', brandRing: 'rgba(26,95,204,0.35)', brandMuted: 'rgba(26,95,204,0.08)',
    flame: '#E08A12', flameDeep: '#C9760A', flameMuted: 'rgba(224,138,18,0.12)',
    success: '#059669', error: '#DC2626',
    shadowResting: '0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)',
    shadowLifted: '0 12px 32px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)',
  },
}

/**
 * The sidebar shell is ALWAYS dark, so it ALWAYS uses the white logo,
 * regardless of theme. No logo switching in the sidebar (per spec).
 * The colored logo is reserved for light surfaces elsewhere (login screen).
 */
export const logos = {
  sidebar: '/brand/imperial-logo-white.png',  // constant
  onLight: '/brand/imperial-logo-color.png',
  onDark: '/brand/imperial-logo-white.png',
  light: '/brand/imperial-logo-color.png',
  dark: '/brand/imperial-logo-white.png',
} as const

export const LOGO_ASPECT = 2.3
export const spring = {
  default: { type: 'spring', stiffness: 400, damping: 30 },
  gentle: { type: 'spring', stiffness: 300, damping: 32 },
} as const
export const THEME_TRANSITION_MS = 360
