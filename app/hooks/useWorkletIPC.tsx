import { useEffect, useState } from 'react'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

export default function useWorkletIPC(IPC: Worklet['IPC'] | null) {
  const [write, setWrite] = useState<Function | null>(null)
  const [response, setResponse] = useState('')

  useEffect(() => {
    if (IPC) {
      setWrite(() => (data: unknown) => {
        setResponse('')
        IPC.write(b4a.from(data))
      })

      IPC.on('data', (data: string) => setResponse(b4a.toString(data)))
    }
  }, [IPC])

  return [write, response]
}
