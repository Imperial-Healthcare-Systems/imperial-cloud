'use client'

import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from '@/hooks/use-theme'
import { logos, LOGO_ASPECT } from '@/lib/theme-config'

interface LogoProps {
  /** rendered height in px; width scales by the asset's aspect ratio */
  height?: number
  /** the logo's intrinsic aspect ratio (width / height). Default tuned to the lockup. */
  aspect?: number
  priority?: boolean
  className?: string
}

/**
 * Intelligent logo switch.
 *
 * - Dark mode  → white logo asset
 * - Light mode → colored logo asset
 * - Never inverts or filters; these are distinct brand files.
 * - Cross-fades the two during a theme change (both briefly stacked).
 * - Reserves a fixed box (height × height*aspect) so there is zero layout
 *   shift while the swap happens.
 * - Before mount, renders an invisible spacer of the exact size to keep SSR
 *   and client markup identical (no hydration flicker).
 */
export function Logo({ height = 30, aspect = LOGO_ASPECT, priority, className }: LogoProps) {
  const { resolvedTheme, mounted } = useTheme()
  const width = Math.round(height * aspect)

  if (!mounted) {
    // Reserve space; invisible until we know the theme.
    return <span style={{ display: 'inline-block', width, height }} aria-hidden className={className} />
  }

  const src = resolvedTheme === 'dark' ? logos.dark : logos.light

  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-block', width, height }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Image
            src={src}
            alt="Imperial Tech Innovations"
            width={width}
            height={height}
            priority={priority}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
