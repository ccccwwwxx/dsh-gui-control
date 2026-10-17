// 自验脚本：不依赖浏览器、不依赖运行中的 Host，把 bundle 当成真实模块加载并跑一遍。
//
// 校验项：
//   1. lib/client.js 与 src/client/* 一致（改源码没重新 build 会在这里失败）；
//   2. bundle 契约：__ModuleLoader__.load({id, factory}) + 导出 apply / inject；
//   3. apply() 在假 ctx 上注册的槽位（2 个 footer 入口 + 1 个设置页区块）；
//   4. 三个组件的宽/窄两种渲染都能产出文案，不依赖真实 React；
//   5. 强刷真的清了缓存、注销了 SW、调了 location.reload；
//   6. 重启两步确认：第一次只武装，第二次才调用 preload 桥；非桌面端禁用；
//   7. zh / en 键集合一致，package.json / cordis.patch.yml 指向的文件都存在。
//
// 用法：node scripts/verify.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

import { buildClient } from '../src/build-client.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')

let checks = 0
const ok = (label) => {
  checks += 1
  console.log(`  ok  ${label}`)
}

// ---------- 1. 产物与源码一致 ----------

const scratch = mkdtempSync(join(tmpdir(), 'dsh-gui-control-'))
const builtPath = join(scratch, 'client.js')
await buildClient(builtPath)
const built = readFileSync(builtPath, 'utf8')
const shipped = read('lib/client.js')
assert.equal(built, shipped, 'lib/client.js is stale: run `npm run build`')
ok('lib/client.js matches src/client/*')

// 两个半侧都真实加载一遍：语法错误、导入解析失败都会在这里暴露。
const hostModule = await import(pathToFileURL(join(root, 'lib/index.js')).href)
assert.equal(hostModule.name, 'dsh-gui-control', 'lib/index.js must export the plugin name')
assert.equal(typeof hostModule.apply, 'function', 'lib/index.js must export apply()')
ok('lib/index.js loads and exports name / apply')

// ---------- 2. 以真实格式加载 bundle ----------

const pkg = JSON.parse(read('package.json'))
let entry = null
const sandbox = {
  window: { __ModuleLoader__: { load: (value) => { entry = value } } },
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask,
}
const context = vm.createContext(sandbox)
vm.runInContext(shipped, context, { filename: 'lib/client.js' })

assert.ok(entry, 'bundle did not call __ModuleLoader__.load')
assert.equal(entry.id, pkg.name, 'bundle id must equal the package name')
assert.equal(typeof entry.factory, 'function', 'bundle must expose a factory')
ok(`bundle registers id "${entry.id}" with a factory`)

// bundle 在 factory 里一次性解构了 useState，所以这里留一个可替换的实现槽：
// mount() 换掉它，组件里解构到的引用仍指向同一个转发函数。
let useStateImpl = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}]

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => useStateImpl(initial),
  useEffect: () => undefined,
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
}

const exportsObject = entry.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require: ${name}`)
})

assert.equal(typeof exportsObject.apply, 'function', 'bundle must export apply()')
assert.ok(Array.isArray(exportsObject.inject), 'bundle must export inject[]')
for (const service of ['slots', 'connection', 'locale']) {
  assert.ok(exportsObject.inject.includes(service), `inject must list ${service}`)
}
ok('bundle exports apply() and inject = [slots, connection, locale]')

// ---------- 3. apply() 注册的槽位 ----------

const dicts = {}
const registrations = []
const localeKeys = []

const fakeCtx = {
  effect: (fn) => {
    try {
      fn()
    } catch (error) {
      throw new Error(`ctx.effect callback threw: ${error.message}`)
    }
    return () => {}
  },
  get: (name) => (name === 'connection' ? null : undefined),
  locale: {
    register: (ns, value) => {
      dicts[ns] = value
      return () => {}
    },
    bind: (ns) => (key, params) => {
      const dict = (dicts[ns] && dicts[ns].zh) || {}
      const raw = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
      localeKeys.push(key)
      if (!params) return raw
      return String(raw).replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
    },
  },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (definition, Component) => {
      registrations.push({ definition, Component })
      return () => {}
    },
  },
}

exportsObject.apply(fakeCtx)

assert.equal(registrations.length, 5, 'expected 2 header entries + 2 footer entries + 1 settings section')
const byId = new Map(registrations.map((item) => [item.definition.id, item]))
for (const id of [
  'gui-control-header-refresh',
  'gui-control-header-restart',
  'gui-control-refresh',
  'gui-control-restart',
  'gui-control',
]) {
  assert.ok(byId.has(id), `missing slot registration: ${id}`)
}
const headerRefresh = byId.get('gui-control-header-refresh')
const headerRestart = byId.get('gui-control-header-restart')
const refresh = byId.get('gui-control-refresh')
const restart = byId.get('gui-control-restart')
const section = byId.get('gui-control')

assert.equal(headerRefresh.definition.name, 'conversation.session.header.utilities')
assert.equal(headerRestart.definition.name, 'conversation.session.header.utilities')
assert.equal(refresh.definition.name, 'sidebar.footer.action')
assert.equal(restart.definition.name, 'sidebar.footer.action')
assert.equal(section.definition.name, 'settings.section')

// 会话头的两个图标按钮必须排在官方那三个按钮左侧（open-in-app = -10，会话日志「更多」= 0）。
assert.ok(headerRefresh.definition.order < headerRestart.definition.order, 'refresh left of restart')
assert.ok(headerRestart.definition.order < -10, 'header entries must sit left of the shipped utilities')
assert.ok(refresh.definition.order < restart.definition.order, 'refresh should come before restart')
assert.equal(typeof section.definition.label, 'function')
assert.equal(section.definition.label(), '界面控制')
ok('apply() registers 2 header utilities, 2 footer actions and 1 settings section')

// ---------- 4. 组件渲染（宽 / 窄） ----------

function mount(Component, initialProps) {
  const states = []
  let element = null
  const render = (nextProps = initialProps) => {
    let index = 0
    useStateImpl = (initial) => {
      const slot = index++
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial
      const setter = (next) => {
        states[slot] = typeof next === 'function' ? next(states[slot]) : next
      }
      return [states[slot], setter]
    }
    element = Component(nextProps)
    return element
  }
  return { render, get element() { return element } }
}

function collectText(node, out) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node !== 'object') return out
  // 函数组件（如 GuiEntry）没被 React 渲染前只是一个元素，这里替 React 调一次。
  if (typeof node.type === 'function') return collectText(node.type(node.props), out)
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectText(child, out)
  }
  return out
}

function findButton(node) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child)
      if (found) return found
    }
    return null
  }
  if (node.type === 'button') return node
  if (typeof node.type === 'function') return findButton(node.type(node.props))
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findButton(child)
      if (found) return found
    }
  }
  return null
}

function textOf(node) {
  return collectText(node, []).join(' ')
}

const props = { t: fakeCtx.locale.bind('guiControl') }

for (const wide of [true, false]) {
  // 宽态是「图标 + 文字」的整行；轨道态只有 32px 图标，语义由 aria-label 承担。
  const refreshView = mount(refresh.Component, { ...props, wide })
  const refreshElement = refreshView.render()
  if (wide) {
    assert.equal(textOf(refreshElement), '强刷', 'refresh label (wide=true)')
  } else {
    assert.equal(findButton(refreshElement).props['aria-label'], '强刷', 'refresh aria-label (rail)')
    assert.ok(String(findButton(refreshElement).props.className).includes('dsh-gui-entry-rail'))
  }

  const restartView = mount(restart.Component, { ...props, wide })
  const restartElement = restartView.render()
  if (wide) {
    assert.equal(textOf(restartElement), '重启', 'restart label (wide=true)')
  } else {
    assert.equal(findButton(restartElement).props['aria-label'], '重启', 'restart aria-label (rail)')
  }
}
ok('footer entries render "强刷" / "重启" in wide and rail layouts')

const sectionView = mount(section.Component, { ...props })
const sectionText = textOf(sectionView.render())
for (const expected of ['界面控制（强刷 / 重启）', '当前运行状态', '强刷', '重启']) {
  assert.ok(sectionText.includes(expected), `settings section missing "${expected}"`)
}
// 读取状态还没返回时不能崩，也不能假装有数据。
assert.ok(sectionText.includes('状态读取失败') || sectionText.includes('读取中'), 'settings should show a loading/error state')
ok('settings section renders title, status placeholder and both actions')

// 会话头：图标按钮没有文字，语义全在 aria-label / title 上。
const headerRefreshView = mount(headerRefresh.Component, props)
const headerRefreshElement = headerRefreshView.render()
const headerRefreshButton = findButton(headerRefreshElement)
assert.ok(headerRefreshButton, 'header refresh button not found')
assert.equal(headerRefreshButton.props['aria-label'], '强刷界面')
assert.ok(String(headerRefreshButton.props.className).includes('dsh-gui-icon-btn'))
assert.equal(headerRefreshButton.children.length, 1, 'header refresh must stay icon-only')
const headerRestartView = mount(headerRestart.Component, props)
const headerRestartButton = findButton(headerRestartView.render())
assert.ok(headerRestartButton, 'header restart button not found')
assert.equal(headerRestartButton.props['aria-label'], '重启 Harness')
assert.ok(String(headerRestartButton.props.className).includes('dsh-gui-gap-after'), 'restart carries the 8px gap')
ok('header entries render icon-only buttons with aria labels')

// ---------- 5. 强刷动作 ----------

let reloads = 0
let cleared = []
let unregistered = 0
sandbox.caches = {
  keys: async () => ['a', 'b'],
  delete: async (key) => {
    cleared.push(key)
    return true
  },
}
sandbox.navigator = {
  serviceWorker: {
    getRegistrations: async () => [{ unregister: async () => { unregistered += 1; return true } }],
  },
}
sandbox.location = { reload: () => { reloads += 1 } }

const refreshClickView = mount(refresh.Component, { ...props, wide: true })
const refreshButton = findButton(refreshClickView.render())
assert.ok(refreshButton, 'refresh button not found')
await refreshButton.props.onClick()
assert.deepEqual(cleared, ['a', 'b'], 'CacheStorage entries must be cleared')
assert.equal(unregistered, 1, 'service worker must be unregistered')
assert.equal(reloads, 1, 'location.reload must be called')
ok('hard refresh clears caches, unregisters service workers and reloads')

// 会话头入口跑的是同一个动作，不能有第二套实现。
cleared = []
reloads = 0
unregistered = 0
const headerReloadView = mount(headerRefresh.Component, props)
await findButton(headerReloadView.render()).props.onClick()
assert.deepEqual(cleared, ['a', 'b'], 'header refresh must clear caches too')
assert.equal(reloads, 1, 'header refresh must reload')
assert.equal(unregistered, 1, 'header refresh must unregister service workers')
ok('header refresh runs the same hard refresh')

// ---------- 6. 重启两步确认 ----------

let restarts = 0
sandbox.dshDesktop = { restartHarness: async () => { restarts += 1; return { ok: true } } }

const restartClickView = mount(restart.Component, { ...props, wide: true })
let rendered = restartClickView.render()
let restartButton = findButton(rendered)
assert.equal(restartButton.props.disabled, false, 'restart must be enabled when the desktop bridge exists')
await restartButton.props.onClick()
assert.equal(restarts, 0, 'first click must only arm, never restart')
rendered = restartClickView.render()
assert.ok(textOf(rendered).includes('确认重启？'), 'armed label should ask for confirmation')
restartButton = findButton(rendered)
await restartButton.props.onClick()
assert.equal(restarts, 1, 'second click must call the desktop restart bridge')
ok('restart requires a second click and then calls window.dshDesktop.restartHarness')

// 会话头入口：同样的两步确认，第二次点击才重启。
const headerRestartClick = mount(headerRestart.Component, props)
let headerRendered = headerRestartClick.render()
let headerButton = findButton(headerRendered)
assert.equal(headerButton.props.disabled, false, 'header restart must be enabled with the bridge')
await headerButton.props.onClick()
assert.equal(restarts, 1, 'header first click must only arm')
headerRendered = headerRestartClick.render()
assert.equal(findButton(headerRendered).props['data-armed'], 'true', 'armed state must be visible')
assert.ok(textOf(headerRendered).includes('再点一次确认重启'), 'armed hint must be shown')
await findButton(headerRendered).props.onClick()
assert.equal(restarts, 2, 'header second click must restart')
ok('header restart uses the same two-step confirmation')

// 非桌面端：禁用 + 说明原因。
delete sandbox.dshDesktop
const browserView = mount(restart.Component, { ...props, wide: true })
const browserButton = findButton(browserView.render())
assert.equal(browserButton.props.disabled, true, 'restart must be disabled without the desktop bridge')
assert.ok(String(browserButton.props.title).includes('DSH Desktop'), 'disabled restart should explain why')
const headerBrowserView = mount(headerRestart.Component, props)
const headerBrowserButton = findButton(headerBrowserView.render())
assert.equal(headerBrowserButton.props.disabled, true, 'header restart must be disabled without the bridge')
assert.ok(String(headerBrowserButton.props.title).includes('DSH Desktop'), 'header restart should explain why')
ok('restart is disabled with an explanation outside DSH Desktop')

// ---------- 7. 文案与包声明 ----------

const textModule = await import(new URL('../lib/text.js', import.meta.url))
const zhKeys = Object.keys(textModule.zh).sort()
const enKeys = Object.keys(textModule.en).sort()
assert.deepEqual(zhKeys, enKeys, 'zh / en dictionaries must have identical keys')
for (const [key, value] of Object.entries(textModule.zh)) {
  assert.ok(typeof value === 'string' && value !== '', `zh.${key} must be a non-empty string`)
  assert.ok(typeof textModule.en[key] === 'string' && textModule.en[key] !== '', `en.${key} must be a non-empty string`)
}
ok(`locale dictionaries have ${zhKeys.length} aligned keys`)

assert.equal(pkg.dsh.client.platform, 'web')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.main, 'lib/index.js')
assert.equal(pkg.exports['.'], './lib/index.js')
assert.equal(pkg.exports['./client'], './lib/client.js')
const patch = read('cordis.patch.yml')
assert.ok(patch.includes('id: dsh-gui-control'), 'patch must insert the plugin entry id')
assert.ok(patch.includes('name: dsh-gui-control'), 'patch entry name must be the package name')
ok('package manifest and cordis.patch.yml agree')

console.log(`\n${checks} checks passed`)
