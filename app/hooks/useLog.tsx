import { useRef, useCallback, useEffect } from 'react'

export default function useLog(logsEnabled: boolean) {
  const ref = useRef(logsEnabled)

  useEffect(() => {
    ref.current = logsEnabled
  }, [logsEnabled])

  return useCallback((...args: any[]) => {
    if (ref.current) console.log(...args)
  }, [])
}
