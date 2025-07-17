import { useRef, useEffect, useState } from 'react'
import { Worklet } from 'react-native-bare-kit'

export default function useWorklet(
  startArgs: Parameters<Worklet['start']>,
  async: boolean = false
) {
  const worklet = useRef(new Worklet()).current
  const [IPC, setIPC] = useState<Worklet['IPC'] | null>(null)

  useEffect(() => {
    if (async === false) {
      worklet.start(...startArgs)
      setIPC(worklet.IPC)
    }

    return () => {
      if (worklet?.terminate) worklet.terminate()
    }
  }, [])

  const init = (asyncArgs: string[]) => {
    worklet.start(startArgs[0], startArgs[1], asyncArgs)
    setIPC(worklet.IPC)
  }

  return async ? [IPC, init] : IPC
}
