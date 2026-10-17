// 构建：把 src/client/*.js 按顺序拼成 lib/client.js（浏览器侧 bundle）。
//
// 产物格式由 DSH 的客户端模块系统规定：一个 `window.__ModuleLoader__.load({id, factory})`
// 调用，factory 里是惰性 CommonJS 模型（`require` 由宿主注入），导出 apply/inject。
// 手写这个头尾容易漂移，所以固定在本脚本里。
//
// 文案（lib/text.js 的 zh / en）在构建时注入，lib/text.js 是唯一维护处。
//
// 用法：node src/build-client.mjs [输出路径]   （默认 lib/client.js）
// 也被 scripts/verify.mjs 作为模块导入（buildClient(outPath)），因此这里不直接
// 依赖进程参数。

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// 顺序即拼接顺序：共享层 → 侧边栏入口 → 会话头入口 → 设置页 → apply。
const ORDER = [
  '00-shared.js',
  '10-footer.js',
  '15-header.js',
  '20-settings.js',
  '90-apply.js',
]

export async function buildClient(outPath = join(root, 'lib', 'client.js')) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const { zh, en } = await import(new URL('../lib/text.js', import.meta.url))

  const parts = ORDER.map((name) => {
    const code = readFileSync(join(here, 'client', name), 'utf8')
    return `// ---- src/client/${name} ----\n${code.trim()}\n`
  })

  const head = `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const { useState, useEffect, useCallback, useMemo, useRef } = require("react");
`

  const locales = `// ---- locales: 由 lib/text.js 注入（单一维护文件，勿手工复制） ----
const zh = ${JSON.stringify(zh, null, 2)}
const en = ${JSON.stringify(en, null, 2)}
`

  const tail = `\nreturn module.exports;\n} });\n`

  const out = [head, locales, ...parts, tail].join('\n')
  const target = resolve(outPath)
  writeFileSync(target, out, 'utf8')
  return { path: target, bytes: Buffer.byteLength(out), parts: ORDER.length }
}

// 直接执行时（node src/build-client.mjs [out]）才写默认产物。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildClient(process.argv[2])
  console.log(`built ${result.path}: ${result.bytes} bytes from ${result.parts} parts`)
}
