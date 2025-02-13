import { useState, useEffect } from 'react'
import { Text } from 'react-native'
import { Worklet } from 'react-native-bare-kit'

export default function () {
  const [response, setReponse] = useState<string | null>(null)

  useEffect(() => {
    const worklet = new Worklet()

    const source = `
    const { IPC } = BareKit

    IPC.setEncoding('utf8')
    IPC.on('data', (data) => console.log(data))
    IPC.write('Hello from Bare!')
    `

    worklet.start('/app.js', source)

    const { IPC } = worklet

    IPC.setEncoding('utf8')
    IPC.on('data', (data: string) => setReponse(data))
    IPC.write('Hello from React Native!')
  }, [])

  return <Text>{response}</Text>
}
