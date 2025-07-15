import { useRef, useEffect, useState } from 'react'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

const noop = (data: unknown) => {}

export default function useWorklet(
  startArgs: Parameters<Worklet['start']>
): [(data: unknown) => void, string] {
  const worklet = useRef(new Worklet()).current

  const [write, setWrite] = useState(() => noop)
  const [response, setResponse] = useState('')

  useEffect(() => {
    worklet.start(...startArgs)

    setWrite(() => (data: unknown) => {
      setResponse('')
      worklet.IPC.write(b4a.from(data))
    })

    worklet.IPC.on('data', (data: string) => setResponse(b4a.toString(data)))

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  return [write, response]
}
