export const source = `
const { IPC } = BareKit
console.log('Worklet started')

IPC.setEncoding('utf8')
IPC.on('data', (data) => { IPC.write(data) })

console.log('Worklet setup complete')
`
