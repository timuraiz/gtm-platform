'use client'

import { motion } from 'framer-motion'

export function TabFade({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
