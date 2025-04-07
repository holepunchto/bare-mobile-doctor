import { useState, useCallback, useRef } from 'react';

interface UsePerfReturn {
  start: () => void;
  stop: () => number | null;
  duration: number | null;
}

export default function usePerf(): UsePerfReturn {
  const [duration, setDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  const start = useCallback(() => {
    startTimeRef.current = Date.now()
    setDuration(null)
  }, []);

  const stop = useCallback(() => {
    if (startTimeRef.current === null) return null
    const elapsed = Date.now() - startTimeRef.current
    setDuration(elapsed)
    startTimeRef.current = null
    return elapsed
  }, []);

  return { start, stop, duration }
}

