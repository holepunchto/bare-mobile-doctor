export const source = `
const { IPC } = BareKit

IPC.setEncoding('utf8')
IPC.on('data', (data) => {
  console.log('Received data:', data)
  if (data === 'ping') {
    IPC.write('Hello from Bare at ' + new Date().toLocaleString())
  }
})
`