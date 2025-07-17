import { useEffect, useState } from 'react'
import useWorklet from './useWorklet'
import type { Worklet } from 'react-native-bare-kit'

import RPC from 'bare-rpc'
import b4a from 'b4a'

export default function useWorkletRPC(
  workletArgs: Parameters<Worklet['start']>
) {
  const [IPC, init] = useWorklet(workletArgs, true)
  const [request, setRequest] = useState<Function | null>(null)

  useEffect(() => {
    if (IPC) {
      const rpc = new RPC(IPC, (req) => {})

      setRequest(() => (stream: number, args: unknown[]) => {
        const req = rpc.request(stream)
        req.send(...args)
        return req.reply().then(b4a.toString)
      })
    }
  }, [IPC])

  return [request, init]
}
