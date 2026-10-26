// VS Code define ELECTRON_RUN_AS_NODE=1, que hace que electron.exe se comporte como node.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE
const cli = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
