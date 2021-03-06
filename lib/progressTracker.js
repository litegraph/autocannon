'use strict'

const ProgressBar = require('progress')
const table = require('table')
const chalk = require('chalk')
const prettyBytes = require('pretty-bytes')
const xtend = require('xtend')
const format = require('./format')
const percentiles = require('./percentiles')
const defaults = {
  // use stderr as its progressBar's default
  outputStream: process.stderr,
  renderProgressBar: true,
  renderResultsTable: true,
  renderLatencyTable: false,
  progressBarString: `${chalk.green('running')} [:bar] :percent`
}

function track (instance, opts) {
  if (!instance) {
    throw new Error('instance required for tracking')
  }

  opts = xtend(defaults, opts)

  const iOpts = instance.opts
  if (opts.renderProgressBar) {
    let msg = `${iOpts.connections} connections`

    if (iOpts.pipelining > 1) {
      msg += ` with ${iOpts.pipelining} pipelining factor`
    }

    if (!iOpts.amount) {
      logToStream(`Running ${iOpts.duration}s test @ ${iOpts.url}\n${msg}\n`)

      // if switch needed needed to avoid
      // https://github.com/mcollina/autocannon/issues/60
      if (opts.outputStream.isTTY) {
        const progressBar = new ProgressBar(opts.progressBarString, {
          width: 20,
          incomplete: ' ',
          total: iOpts.duration,
          clear: true,
          stream: opts.outputStream
        })

        progressBar.tick(0)
        instance.on('done', () => progressBar.tick(iOpts.duration - 1))
        instance.on('tick', () => progressBar.tick())
        process.once('SIGINT', () => {
          progressBar.tick(iOpts.duration - 1)
        })
      }
    } else {
      logToStream(`Running ${iOpts.amount} requests test @ ${iOpts.url}\n${msg}\n`)

      // if switch needed needed to avoid
      // https://github.com/mcollina/autocannon/issues/60
      if (opts.outputStream.isTTY) {
        const progressBar = new ProgressBar(opts.progressBarString, {
          width: 20,
          incomplete: ' ',
          total: iOpts.amount,
          clear: true,
          stream: opts.outputStream
        })

        progressBar.tick(0)

        instance.on('done', () => progressBar.tick(iOpts.amount - 1))
        instance.on('response', () => {
          progressBar.tick()
        })
        instance.on('reqError', () => {
          progressBar.tick()
        })

        process.once('SIGINT', () => {
          progressBar.tick(iOpts.amount - 1)
        })
      }
    }
  }

  instance.on('done', (result) => {
    // the code below this `if` just renders the results table...
    // if the user doesn't want to render the table, we can just return early
    if (!opts.renderResultsTable) return

    const out = table.default([
      asColor('cyan', ['Stat', 'Avg', 'Stdev', 'Max']),
      asRow(chalk.bold('Latency (ms)'), result.latency),
      asRow(chalk.bold('Req/Sec'), result.requests),
      asRow(chalk.bold('Bytes/Sec'), asBytes(result.throughput))
    ], {
      border: table.getBorderCharacters('void'),
      columnDefault: {
        paddingLeft: 0,
        paddingRight: 1
      },
      drawHorizontalLine: () => false
    })

    logToStream(out)

    if (opts.renderLatencyTable) {
      const latency = table.default([
        asColor('cyan', ['Percentile', 'Latency (ms)'])
      ].concat(percentiles.map((perc) => {
        const key = ('p' + perc).replace('.', '')
        return [
          chalk.bold('' + perc),
          result.latency[key]
        ]
      })), {
        border: table.getBorderCharacters('void'),
        columnDefault: {
          paddingLeft: 0,
          paddingRight: 6
        },
        drawHorizontalLine: () => false
      })

      logToStream(latency)
    }

    if (result.non2xx) {
      logToStream(`${result['2xx']} 2xx responses, ${result.non2xx} non 2xx responses`)
    }
    logToStream(`${format(result.requests.total)} requests in ${result.duration}s, ${prettyBytes(result.throughput.total)} read`)
    if (result.errors) {
      logToStream(`${format(result.errors)} errors (${format(result.timeouts)} timeouts)`)
    }
  })

  function logToStream (msg) {
    opts.outputStream.write(msg + '\n')
  }
}

function asRow (name, stat) {
  return [
    name,
    stat.average,
    stat.stddev,
    stat.max
  ]
}

function asColor (color, row) {
  return row.map((entry) => chalk[color](entry))
}

function asBytes (stat) {
  const result = Object.create(stat)
  result.average = prettyBytes(stat.average)
  result.stddev = prettyBytes(stat.stddev)
  result.max = prettyBytes(stat.max)
  result.min = prettyBytes(stat.min)
  return result
}

module.exports = track
