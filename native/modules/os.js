const top = require('process-top')()

module.exports = {
  name: 'OS',
  options: ['cpu', 'memory'],
  run(log, option) {
    const read = option === 'cpu' ? cpu : memory
    const timer = setInterval(sample, 1000)

    let samples = 0

    sample()

    return () => clearInterval(timer)

    function sample() {
      log.stats({ sample: ++samples, ...read() })
    }

    function cpu() {
      const { percent, system, user, count, time } = top.cpu()

      return {
        cpu: pct(percent),
        threads: count,
        system: `${system} ms`,
        user: `${user} ms`,
        uptime: `${time.toFixed(0)} s`
      }
    }

    function memory() {
      const { percent, rss, heapUsed, heapTotal, external } = top.memory()

      return {
        device: pct(percent),
        rss: `${mb(rss)} MB`,
        heap: `${mb(heapUsed)} / ${mb(heapTotal)} MB`,
        external: `${mb(external)} MB`
      }
    }
  }
}

function pct(value) {
  return `${(value * 100).toFixed(1)} %`
}

function mb(bytes) {
  return (bytes / 1024 ** 2).toFixed(1)
}
