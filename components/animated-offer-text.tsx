'use client'

import { motion, AnimatePresence } from 'framer-motion'

export function AnimatedOfferText({ text }: { text: string | null | undefined }) {
  if (!text) return null
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.p
        key={text}
        initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="mt-1 text-sm text-zinc-500 max-w-2xl whitespace-pre-line"
      >
        {text}
      </motion.p>
    </AnimatePresence>
  )
}
