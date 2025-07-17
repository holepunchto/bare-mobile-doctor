import { useRef, useEffect, useState } from 'react'
import { Worklet } from 'react-native-bare-kit'

import RPC from 'bare-rpc'
import b4a from 'b4a'

export default function useWorkletRPC(filename: string, source: string) {
  const worklet = useRef(new Worklet()).current
  const [request, setRequest] = useState<Function | null>(null)

  useEffect(() => {
    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  const init = (asyncArgs: string[]) => {
    worklet.start(filename, source, asyncArgs)

    const rpc = new RPC(worklet.IPC, (req) => {})

    setRequest(() => (stream: number, args: unknown[]) => {
      const req = rpc.request(stream)
      req.send(...args)
      return req.reply().then(b4a.toString)
    })
  }

  return [request, init]
}
