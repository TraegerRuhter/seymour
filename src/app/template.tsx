'use client';

import { motion } from 'framer-motion';
import { enter, fadeRise } from '@/lib/motion';

/**
 * Remounts on every navigation, giving each page a subtle fade/rise
 * entrance. Honors prefers-reduced-motion via the MotionConfig in
 * AppProviders.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={fadeRise} initial="initial" animate="animate" transition={enter}>
      {children}
    </motion.div>
  );
}
