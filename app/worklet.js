export const source = `
const { IPC } = BareKit

console.log('Worklet started')
IPC.setEncoding('utf8')

// Handle different message types
IPC.on('data', (data) => {
  console.log('Worklet received:', data)
  try {
    const message = JSON.parse(data)
    switch (message.type) {
      case 'ping':
        console.log('Handling ping')
        IPC.write(JSON.stringify({
          type: 'pong',
          echo: message.data
        }))
        break
      case 'echo':
        console.log('Handling echo')
        IPC.write(JSON.stringify({
          type: 'echo_response',
          data: message.data
        }))
        break
      case 'compute':
        console.log('Starting computation')
        let result = 0
        for(let i = 0; i < message.iterations; i++) {
          result += Math.sqrt(i)
        }
        console.log('Computation complete')
        IPC.write(JSON.stringify({
          type: 'compute',
          result
        }))
        break
      default:
        console.log('Unknown message type:', message.type)
    }
  } catch (err) {
    console.error('Error in worklet:', err)
    IPC.write(JSON.stringify({
      type: 'error',
      message: err.message
    }))
  }
})

console.log('Worklet setup complete')
`