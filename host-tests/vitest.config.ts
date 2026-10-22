import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../vitest.shared.ts'

// This config is copied into the isolated checkout's scratch-file-actions directory.
const upstream = process.cwd()
const project = process.env.DFA_PROJECT!
if (!project) throw new Error('Run via npm run test:host')
const parsed = ts.readConfigFile(resolve(upstream, 'tsconfig.base.json'), ts.sys.readFile)
if (parsed.error) throw new Error('Cannot read the pinned upstream paths')
const paths: Record<string, string[]> = parsed.config.compilerOptions.paths

export default defineConfig({
  root: project,
  plugins: [
    {
      name: 'file-actions-official-source-resolution',
      enforce: 'pre',
      async resolveId(id) {
        if (id.startsWith('host-source/')) {
          return this.resolve(resolve(upstream, id.slice('host-source/'.length)), undefined, { skipSelf: true })
        }
        for (const [key, values] of Object.entries(paths)) {
          const star = key.indexOf('*')
          let mapped: string | undefined
          if (star < 0 && key === id) mapped = values[0]
          else if (star >= 0 && id.startsWith(key.slice(0, star)) && id.endsWith(key.slice(star + 1))) {
            mapped = values[0]?.replace('*', id.slice(star, id.length - key.length + star + 1))
          }
          if (mapped) return this.resolve(resolve(upstream, mapped), undefined, { skipSelf: true })
        }
        const sourceLeaf = /^(@deepseek-ai\/[^/]+)\/src\/(.+)$/.exec(id)
        if (sourceLeaf) {
          const entry = paths[sourceLeaf[1]!]?.[0]
          if (entry) {
            const sourceRoot = /\.[cm]?ts$/.test(entry) ? dirname(entry) : entry
            return this.resolve(resolve(upstream, sourceRoot, sourceLeaf[2]!), undefined, { skipSelf: true })
          }
        }
      },
    },
    standardDecoratorPlugin(),
  ],
  resolve: { alias: { vitest: resolve(upstream, 'node_modules/vitest/dist/index.js') } },
  test: {
    include: ['host-tests/*.spec.ts'],
    pool: 'forks',
    execArgv: vitestExecArgv,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20000,
    hookTimeout: 10000,
  },
})
