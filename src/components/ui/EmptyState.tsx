import React from 'react'
import { motion } from 'framer-motion'
import Button from './Button'

type Variant = 'welcome' | 'empty' | 'intercepting'

interface EmptyStateProps {
  variant?: Variant
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

function ProxyIcon() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" className="opacity-60">
      <circle cx="48" cy="48" r="44" fill="#051009" stroke="#163824" strokeWidth="2"/>
      {/* Orbit rings */}
      <ellipse cx="48" cy="48" rx="32" ry="14" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"/>
      <ellipse cx="48" cy="48" rx="14" ry="32" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"/>
      {/* Center dot */}
      <circle cx="48" cy="48" r="6" fill="#22c55e" opacity="0.8"/>
      {/* Orbiting dot */}
      <circle cx="80" cy="48" r="4" fill="#4ade80" opacity="0.9"/>
      {/* Network lines */}
      <line x1="28" y1="34" x2="48" y2="48" stroke="#22c55e" strokeWidth="1" opacity="0.3"/>
      <line x1="68" y1="34" x2="48" y2="48" stroke="#22c55e" strokeWidth="1" opacity="0.3"/>
      <line x1="48" y1="70" x2="48" y2="48" stroke="#22c55e" strokeWidth="1" opacity="0.3"/>
    </svg>
  )
}

function SlothImage({ variant }: { variant: Variant }) {
  const [failed, setFailed] = React.useState(false)

  if (failed || variant === 'intercepting') {
    return <ProxyIcon />
  }

  return (
    <img
      src="/images/slothy-proxyorbit.png"
      alt="ProxyOrbit mascot"
      className="w-52 h-auto object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function EmptyState({ variant = 'empty', title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-14 px-6 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-2 pt-2"
      >
        <SlothImage variant={variant} />
      </motion.div>
      <h3 className="mt-3 text-text-primary font-display font-bold text-base">{title}</h3>
      {description && (
        <p className="mt-1.5 text-text-secondary text-xs max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </motion.div>
  )
}

export default EmptyState
