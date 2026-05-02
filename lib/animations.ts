import type { Variants, Transition } from 'framer-motion'

export const spring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
}

export const springGentle: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0 },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1 },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show:   { opacity: 1, scale: 1 },
}

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: 'blur(8px)', y: 4 },
  show:   { opacity: 1, filter: 'blur(0px)', y: 0 },
}

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -8 },
  show:   { opacity: 1, x: 0 },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02,
    },
  },
}

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1 },
}

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show:   { opacity: 1, scale: 1,    y: 0 },
}
