import { spawnSync } from 'node:child_process'

const result = spawnSync('forge', process.argv.slice(2), {
  stdio: 'inherit',
})

if (result.error?.code === 'ENOENT') {
  console.error('Foundry forge is not installed. Install it with:')
  console.error('  curl -L https://foundry.paradigm.xyz | bash')
  console.error('  foundryup')
  process.exit(127)
}

process.exit(result.status ?? 1)
