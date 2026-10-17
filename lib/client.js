window.__ModuleLoader__.load({ id: "dsh-gui-control", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const { useState, useEffect, useCallback, useMemo, useRef } = require("react");

// ---- locales: 由 lib/text.js 注入（单一维护文件，勿手工复制） ----
const zh = {
  "nav": "界面控制",
  "title": "界面控制（强刷 / 重启）",
  "subtitle": "改了客户端插件看不到效果 → 先强刷；改了 Host 侧代码或换了插件版本 → 重启。",
  "footerRefresh": "强刷",
  "footerRestart": "重启",
  "footerRefreshHint": "强刷界面：清空浏览器缓存后整页重载，重新拉取所有客户端插件。",
  "footerRestartHint": "重启 Harness：Host 进程重启并重新加载界面；正在运行的任务会被中断。",
  "refreshDoing": "强刷中…",
  "refreshDone": "已清缓存，正在重载…",
  "restartConfirmLabel": "确认重启？",
  "confirmHint": "再次点击确认；{seconds} 秒后自动取消",
  "restartDoing": "重启中…",
  "restartDesktopOnly": "重启只在 DSH Desktop 桌面端可用；浏览器版请用「强刷」。",
  "restartManualHint": "若界面没有自动刷新，请点「强刷」。",
  "restartFailed": "重启失败：{detail}",
  "refreshHint": "强刷不影响 Host 进程，只重载这一页。",
  "statusTitle": "当前运行状态",
  "statusLoading": "读取中…",
  "statusFailed": "状态读取失败：{detail}",
  "statusVersion": "插件版本",
  "statusHostPid": "Host 进程",
  "statusUptime": "Host 已运行",
  "statusPlatform": "运行平台",
  "statusProfile": "Profile",
  "statusDesktop": "界面载体",
  "desktopYes": "DSH Desktop",
  "desktopNo": "浏览器 / 非桌面端",
  "retry": "重试",
  "explainTitle": "这两个动作分别解决什么",
  "explainRefresh": "强刷 = 清空页面缓存并整页重载。适用于：客户端插件改完没生效、界面卡在旧的插件列表、样式错乱。它不会重启 Host，正在运行的任务不受影响。",
  "explainRestart": "重启 = 让 DSH Desktop 重启 Host 进程，然后重新加载这一页。适用于：Host 侧（node 半侧）代码改动、插件安装/升级后需要重新加载。正在运行的任务会被中断。"
}
const en = {
  "nav": "GUI Control",
  "title": "GUI Control (Hard Refresh / Restart)",
  "subtitle": "Client plugin change not showing up → hard refresh. Host-side code or plugin version changed → restart.",
  "footerRefresh": "Refresh",
  "footerRestart": "Restart",
  "footerRefreshHint": "Hard refresh: clear browser caches, then reload the page and re-fetch every client plugin bundle.",
  "footerRestartHint": "Restart Harness: restart the Host process and reload this page. Running tasks will be interrupted.",
  "refreshDoing": "Refreshing…",
  "refreshDone": "Caches cleared, reloading…",
  "restartConfirmLabel": "Confirm restart?",
  "confirmHint": "Click again to confirm; cancels in {seconds}s",
  "restartDoing": "Restarting…",
  "restartDesktopOnly": "Restart is only available inside DSH Desktop; in a browser use \"Refresh\".",
  "restartManualHint": "If the page did not reload itself, click \"Refresh\".",
  "restartFailed": "Restart failed: {detail}",
  "refreshHint": "A hard refresh does not touch the Host process; it only reloads this page.",
  "statusTitle": "Runtime status",
  "statusLoading": "Loading…",
  "statusFailed": "Could not read status: {detail}",
  "statusVersion": "Plugin version",
  "statusHostPid": "Host process",
  "statusUptime": "Host uptime",
  "statusPlatform": "Platform",
  "statusProfile": "Profile",
  "statusDesktop": "Surface",
  "desktopYes": "DSH Desktop",
  "desktopNo": "Browser / non-desktop",
  "retry": "Retry",
  "explainTitle": "What each action is for",
  "explainRefresh": "Hard refresh clears page caches and reloads everything. Use it when a client plugin change is not visible, the plugin list looks stale, or styles broke. It does not restart the Host, so running tasks are unaffected.",
  "explainRestart": "Restart asks DSH Desktop to restart the Host process, then reloads this page. Use it after Host-side (node half) code changes or plugin installs/upgrades. Running tasks are interrupted."
}

// ---- src/client/00-shared.js ----
// 共享层：命名空间、注入面、RPC 封装，以及「强刷」「重启」两个真实动作。
//
// 为什么这两个动作要单独做成插件：
//   · 客户端插件（lib/client.js）只有整页重载才会重新拉取并重新执行 factory，
//     改了客户端代码后界面上没有任何「重新加载」的入口，只能去菜单里找；
//   · Host 侧（node 半侧）代码或插件安装变更，只有重启 Host 进程才生效，而重启
//     由 DSH Desktop 的 preload 桥提供（window.dshDesktop.restartHarness →
//     主进程 IPC harness:restart），普通浏览器里没有这条路。
// 所以两个动作分两处实现，并按「界面载体」区分可用性。

const NS = 'guiControl'

// 客户端服务依赖：slots 注册入口、connection 发 RPC、locale 取文案。
const inject = ['slots', 'connection', 'locale']

// 与 node 半侧约定的方法前缀（lib/index.js RPC_PREFIX）。
const RPC_PREFIX = 'dsh-gui-control.'

const STYLE_ID = 'dsh-gui-control-style'

// 统一解包 { ok, value } 信封；失败时抛出服务端消息。connection 缺失也不崩，
// 只是把这个方法变成一次可见的失败（设置页会显示「状态读取失败」）。
function rpc(connection) {
  const call = async (method, payload) => {
    if (!connection || typeof connection.rpc?.call !== 'function') {
      throw new Error('connection service unavailable')
    }
    const res = await connection.rpc.call('/api', method, payload)
    if (res && res.ok === true) return res.value
    const msg = res?.error?.message ?? res?.error ?? 'RPC failed'
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return {
    state: () => call(RPC_PREFIX + 'state', {}),
  }
}

// 文案取值兜底：t 缺失或抛错时退回 key，绝不因文案问题中断渲染。
function t0(props, key, params) {
  try {
    const value = props && typeof props.t === 'function' ? props.t(key, params) : key
    return typeof value === 'string' && value !== '' ? value : key
  } catch {
    return key
  }
}

function errorText(error) {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

// 运行时长：跨天后给 d h m，其余 m s。刻意用 ASCII 单位，两种语言都读得懂。
function formatUptime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000)
  const seconds = Math.floor(total % 60)
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600) % 24
  const days = Math.floor(total / 86400)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// DSH Desktop 的 preload 桥：只有桌面窗口里有；浏览器里是 undefined。
// 每次调用都重新读，不缓存——测试与热替换下都不会拿到过期引用。
function desktopBridge() {
  try {
    const bridge = globalThis.dshDesktop
    return bridge && typeof bridge.restartHarness === 'function' ? bridge : null
  } catch {
    return null
  }
}

// 强刷：清 CacheStorage / 注销 Service Worker，然后整页重载。
//
// 能做什么、不能做什么要讲清楚：页面脚本无法改变文档自身的 cache 模式，所以这不是
// Ctrl+F5 的严格等价物；但本 GUI 会「陈旧」的三个来源都被覆盖了——
//   1) CacheStorage 里的缓存条目；
//   2) 残留的 Service Worker；
//   3) 模块 factory 的进程内记忆（整页重载即清空）。
// 插件 bundle 的 URL 自带 rev=，Host 侧按 revision 缓存字节，所以重载后拿到的是最新产物。
async function hardReload() {
  const steps = { caches: 0, serviceWorkers: 0, reloaded: false }
  try {
    if (globalThis.caches && typeof globalThis.caches.keys === 'function') {
      const keys = await globalThis.caches.keys()
      await Promise.all(keys.map((key) => globalThis.caches.delete(key)))
      steps.caches = keys.length
    }
  } catch {
    // 缓存 API 不可用/被禁用：继续重载，不影响主目的。
  }
  try {
    const sw = globalThis.navigator && globalThis.navigator.serviceWorker
    if (sw && typeof sw.getRegistrations === 'function') {
      const regs = await sw.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
      steps.serviceWorkers = regs.length
    }
  } catch {
    // 同上。
  }
  try {
    if (globalThis.location && typeof globalThis.location.reload === 'function') {
      globalThis.location.reload()
      steps.reloaded = true
    }
  } catch {
    // 重载失败时不抛：调用方会把错误显示出来。
  }
  return steps
}

// 重启 Harness：走桌面壳的 preload 桥。调用成功后 Host 会重启并重新加载页面，
// 因此这里通常不会走到「之后」的代码；失败（桥拒绝/未就绪）会把错误抛给调用方。
async function restartHarness() {
  const bridge = desktopBridge()
  if (!bridge) {
    const error = new Error('desktop-only')
    error.code = 'desktop-only'
    throw error
  }
  return bridge.restartHarness()
}

// ---------- 样式 ----------
// 只注入一份（按 id 复用），随插件卸载移除。类名用 dsh-gui- 前缀，不依赖构建哈希。
const CSS = [
  '.dsh-gui-entry{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;margin:2px 0;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}',
  '.dsh-gui-entry:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsh-gui-entry:disabled{opacity:.55;cursor:default}',
  '.dsh-gui-entry[data-tone="danger"]{color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '.dsh-gui-entry[data-tone="danger"]:hover:not(:disabled){background:rgba(229,72,77,.12)}',
  '.dsh-gui-entry[data-armed="true"]{border-color:currentColor}',
  '.dsh-gui-entry-rail{width:32px;height:32px;margin:0 auto;padding:0;justify-content:center;gap:0}',
  '.dsh-gui-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px}',
  '.dsh-gui-entry-label{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-gui-section{box-sizing:border-box;max-width:720px;min-width:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,inherit)}',
  '.dsh-gui-title{margin:0;font-size:15px;line-height:22px;font-weight:600}',
  '.dsh-gui-subtitle{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888)}',
  '.dsh-gui-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1,#e3e3e3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}',
  '.dsh-gui-row{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:18px;min-width:0}',
  '.dsh-gui-row-key{flex:none;width:96px;color:var(--dsw-alias-label-tertiary,#888)}',
  '.dsh-gui-row-value{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,inherit)}',
  '.dsh-gui-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.dsh-gui-btn{box-sizing:border-box;height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.45));border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer}',
  '.dsh-gui-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsh-gui-btn:disabled{opacity:.5;cursor:default}',
  '.dsh-gui-btn[data-tone="primary"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#4d6bfe);color:var(--dsw-alias-label-primary-foreground,#fff)}',
  '.dsh-gui-btn[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary,#e5484d);color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '.dsh-gui-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888);margin:0}',
  '.dsh-gui-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5484d);margin:0;overflow-wrap:anywhere}',
  '.dsh-gui-explain{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
].join('\n')

// 注入样式；ctx.effect 负责卸载时移除。document 不存在（SSR / 测试环境）时静默跳过。
function installStyles(ctx) {
  try {
    const doc = typeof document === 'undefined' ? null : document
    if (!doc || !doc.head) return
    ctx.effect(() => {
      let el = doc.getElementById(STYLE_ID)
      if (!el) {
        el = doc.createElement('style')
        el.id = STYLE_ID
        el.textContent = CSS
        doc.head.appendChild(el)
      }
      const owned = el
      return () => {
        if (owned && owned.isConnected !== false) owned.remove()
      }
    }, 'dsh-gui-control: styles')
  } catch (error) {
    console.error('[dsh-gui-control] style injection failed', error)
  }
}

// ---- src/client/10-footer.js ----
// 侧边栏底部两个入口：强刷 / 重启。
//
// 槽契约：sidebar.footer.action 是 list / root 槽，owner 渲染时传入 { wide }——
// wide=true 是底部展开区的整行，wide=false 是 56px 轨道（只剩图标位）。
// 每个 list 项必须有唯一 id，所以强刷与重启是两条独立注册（见 90-apply.js）。
//
// 重启是破坏性动作（中断正在运行的任务），所以做成两步：第一次点击「武装」，
// 4 秒内再点一次才真的重启，超时自动取消——不用原生 confirm（它会阻塞渲染进程）。

const CONFIRM_WINDOW_MS = 4000

// 「武装」状态：armed 时启动一个自动取消计时器。
function useArmed(ms) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (armed !== true) return undefined
    const id = setTimeout(() => setArmed(false), ms)
    return () => clearTimeout(id)
  }, [armed, ms])
  return [armed, setArmed]
}

function RefreshIcon(props) {
  const h = React.createElement
  const size = props && props.size ? props.size : 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    style: { flex: 'none' },
  }, [
    h('path', { key: 'arc', d: 'M13.2 8a5.2 5.2 0 1 1-1.8-3.9' }),
    h('path', { key: 'head', d: 'M13.2 2.2v3.4h-3.4' }),
  ])
}

function PowerIcon(props) {
  const h = React.createElement
  const size = props && props.size ? props.size : 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    style: { flex: 'none' },
  }, [
    h('path', { key: 'stem', d: 'M8 1.9v5.2' }),
    h('path', { key: 'ring', d: 'M12.1 3.9a5.2 5.2 0 1 1-8.2 0' }),
  ])
}

// 通用入口按钮：wide 时图标 + 文字，轨道态只有 32px 图标按钮。
// 不加第二行说明文字——底部区域已经够挤，提示统一放 title / aria-label。
function GuiEntry(props) {
  const h = React.createElement
  const wide = props.wide !== false
  const busy = props.busy === true
  const label = props.label
  const icon = props.icon
  const children = wide
    ? [
      h('span', { key: 'icon', className: 'dsh-gui-icon' }, icon),
      h('span', { key: 'label', className: 'dsh-gui-entry-label' }, label),
    ]
    : [h('span', { key: 'icon', className: 'dsh-gui-icon' }, icon)]

  return h('button', {
    type: 'button',
    className: wide ? 'dsh-gui-entry' : 'dsh-gui-entry dsh-gui-entry-rail',
    'data-tone': props.tone || 'normal',
    'data-armed': props.armed === true ? 'true' : 'false',
    title: props.title || label,
    'aria-label': props.ariaLabel || label,
    disabled: props.disabled === true || busy,
    onClick: props.onClick,
  }, children)
}

// 强刷入口：点了就做，不确认——它不破坏任何东西，最坏情况就是页面刷新一次。
function RefreshFooterAction(props) {
  const h = React.createElement
  const t = props && typeof props.t === 'function' ? props.t : null
  const [busy, setBusy] = useState(false)

  const onClick = () => {
    if (busy === true) return Promise.resolve()
    setBusy(true)
    // 页面即将重载，通常不会走到 then；catch 只是兜底（缓存 API 被禁用等）。
    // 返回 Promise 只为让调用方（含自验脚本）能等到动作真正结束，React 会忽略它。
    const pending = hardReload()
    if (pending && typeof pending.catch === 'function') pending.catch(() => setBusy(false))
    return pending
  }

  if (!t) return null
  const label = busy ? t0(props, 'refreshDoing') : t0(props, 'footerRefresh')
  return h(GuiEntry, {
    wide: props.wide,
    icon: h(RefreshIcon, { size: 16 }),
    label,
    title: t0(props, 'footerRefreshHint'),
    ariaLabel: label,
    busy,
    onClick,
  })
}

// 重启入口：两步确认；非桌面端直接禁用，title 写明原因。
function RestartFooterAction(props) {
  const h = React.createElement
  const t = props && typeof props.t === 'function' ? props.t : null
  const [armed, setArmed] = useArmed(CONFIRM_WINDOW_MS)
  const [busy, setBusy] = useState(false)
  const bridge = desktopBridge()

  if (!t) return null

  const onClick = () => {
    if (busy === true || !desktopBridge()) return Promise.resolve()
    if (armed !== true) {
      setArmed(true)
      return Promise.resolve()
    }
    setArmed(false)
    setBusy(true)
    const pending = restartHarness()
    if (pending && typeof pending.catch === 'function') {
      // 失败（Host 未就绪 / 桥拒绝）时解除忙碌状态，并让提示带上原因。
      pending.catch(() => setBusy(false))
    }
    return pending
  }

  const label = busy
    ? t0(props, 'restartDoing')
    : armed
      ? t0(props, 'restartConfirmLabel')
      : t0(props, 'footerRestart')
  const title = bridge === null
    ? t0(props, 'restartDesktopOnly')
    : armed
      ? t0(props, 'confirmHint', { seconds: Math.round(CONFIRM_WINDOW_MS / 1000) })
      : t0(props, 'footerRestartHint')

  return h(GuiEntry, {
    wide: props.wide,
    icon: h(PowerIcon, { size: 16 }),
    label,
    title,
    ariaLabel: label,
    armed,
    tone: armed || busy ? 'danger' : 'normal',
    busy,
    disabled: bridge === null,
    onClick,
  })
}

// ---- src/client/20-settings.js ----
// 设置页「界面控制」区块：运行状态 + 两个动作 + 说明。
//
// 状态来自 node 半侧的只读 RPC（版本 / Host pid / 运行时长 / Profile）。这些正是
// 「改了但没生效」时最先要确认的三件事：加载的是哪一版、Host 是不是还是旧进程、
// 客户端这次是不是真的重新拉取过。

function StatusRow(props) {
  const h = React.createElement
  return h('div', { className: 'dsh-gui-row' }, [
    h('span', { key: 'key', className: 'dsh-gui-row-key' }, props.label),
    h('span', { key: 'value', className: 'dsh-gui-row-value', title: props.title }, props.value),
  ])
}

function GuiControlSection(props) {
  const h = React.createElement
  const rpcApi = props ? props.rpc : null
  const [snapshot, setSnapshot] = useState({ phase: 'loading', data: null, error: '' })
  const [reloadToken, setReloadToken] = useState(0)
  const [armed, setArmed] = useArmed(CONFIRM_WINDOW_MS)
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const bridge = desktopBridge()

  useEffect(() => {
    let cancelled = false
    if (!rpcApi || typeof rpcApi.state !== 'function') {
      setSnapshot({ phase: 'failed', data: null, error: 'connection service unavailable' })
      return undefined
    }
    setSnapshot((previous) => ({ ...previous, phase: 'loading' }))
    const pending = rpcApi.state()
    if (pending && typeof pending.then === 'function') {
      pending.then(
        (value) => {
          if (!cancelled) setSnapshot({ phase: 'ready', data: value, error: '' })
        },
        (error) => {
          if (!cancelled) setSnapshot({ phase: 'failed', data: null, error: errorText(error) })
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [rpcApi, reloadToken])

  const onRefresh = () => {
    if (refreshing === true) return Promise.resolve()
    setRefreshing(true)
    const pending = hardReload()
    if (pending && typeof pending.catch === 'function') pending.catch(() => setRefreshing(false))
    return pending
  }

  const onRestart = () => {
    if (restarting === true || !desktopBridge()) return Promise.resolve()
    if (armed !== true) {
      setArmed(true)
      return Promise.resolve()
    }
    setArmed(false)
    setRestarting(true)
    setRestartError('')
    const pending = restartHarness()
    if (pending && typeof pending.then === 'function') {
      pending.then(
        // 正常情况下 Host 重启后页面会被重新加载，走不到这里；兜底给一句提示。
        () => setRestarting(false),
        (error) => {
          setRestarting(false)
          setRestartError(errorText(error))
        },
      )
    }
    return pending
  }

  const data = snapshot.data
  const ready = snapshot.phase === 'ready' && data !== null
  const loading = snapshot.phase === 'loading'

  const rows = []
  if (ready) {
    rows.push(h(StatusRow, { key: 'version', label: t0(props, 'statusVersion'), value: 'v' + data.version }))
    rows.push(h(StatusRow, { key: 'pid', label: t0(props, 'statusHostPid'), value: String(data.pid) }))
    rows.push(h(StatusRow, { key: 'uptime', label: t0(props, 'statusUptime'), value: formatUptime(data.uptimeMs) }))
    rows.push(h(StatusRow, { key: 'platform', label: t0(props, 'statusPlatform'), value: `${data.platform} ${data.arch} · node ${data.node}` }))
    if (data.profile) rows.push(h(StatusRow, { key: 'profile', label: t0(props, 'statusProfile'), value: String(data.profile) }))
    rows.push(h(StatusRow, {
      key: 'desktop',
      label: t0(props, 'statusDesktop'),
      value: bridge === null ? t0(props, 'desktopNo') : t0(props, 'desktopYes'),
    }))
  }

  const restartLabel = restarting
    ? t0(props, 'restartDoing')
    : armed
      ? t0(props, 'restartConfirmLabel')
      : t0(props, 'footerRestart')
  const restartTitle = bridge === null
    ? t0(props, 'restartDesktopOnly')
    : armed
      ? t0(props, 'confirmHint', { seconds: Math.round(CONFIRM_WINDOW_MS / 1000) })
      : t0(props, 'footerRestartHint')

  return h('div', { className: 'dsh-gui-section' }, [
    h('h2', { key: 'title', className: 'dsh-gui-title' }, t0(props, 'title')),
    h('p', { key: 'subtitle', className: 'dsh-gui-subtitle' }, t0(props, 'subtitle')),

    h('div', { key: 'status', className: 'dsh-gui-card' },
      h('div', { key: 'status-title', className: 'dsh-gui-row' },
        h('span', { key: 'key', className: 'dsh-gui-row-key' }, t0(props, 'statusTitle')),
        h('span', { key: 'value', className: 'dsh-gui-row-value' }, loading ? t0(props, 'statusLoading') : ''),
      ),
      ...rows,
      snapshot.phase === 'failed'
        ? h('p', { key: 'error', className: 'dsh-gui-error' }, t0(props, 'statusFailed', { detail: snapshot.error }))
        : null,
      snapshot.phase === 'failed'
        ? h('div', { key: 'retry', className: 'dsh-gui-actions' },
          h('button', { type: 'button', className: 'dsh-gui-btn', onClick: () => setReloadToken((value) => value + 1) }, t0(props, 'retry')),
        )
        : null,
    ),

    h('div', { key: 'actions', className: 'dsh-gui-actions' }, [
      h('button', {
        key: 'refresh',
        type: 'button',
        className: 'dsh-gui-btn',
        'data-tone': 'primary',
        disabled: refreshing === true,
        title: t0(props, 'footerRefreshHint'),
        onClick: onRefresh,
      }, refreshing === true ? t0(props, 'refreshDoing') : t0(props, 'footerRefresh')),
      h('button', {
        key: 'restart',
        type: 'button',
        className: 'dsh-gui-btn',
        'data-tone': armed || restarting ? 'danger' : 'normal',
        disabled: bridge === null || restarting === true,
        title: restartTitle,
        onClick: onRestart,
      }, restartLabel),
    ]),

    restartError !== ''
      ? h('p', { key: 'restart-error', className: 'dsh-gui-error' }, t0(props, 'restartFailed', { detail: restartError }))
      : null,
    restartError !== '' && restarting === false
      ? h('p', { key: 'restart-manual', className: 'dsh-gui-note' }, t0(props, 'restartManualHint'))
      : null,
    bridge === null
      ? h('p', { key: 'desktop-only', className: 'dsh-gui-note' }, t0(props, 'restartDesktopOnly'))
      : null,

    h('ul', { key: 'explain', className: 'dsh-gui-explain' }, [
      h('li', { key: 'refresh' }, t0(props, 'explainRefresh')),
      h('li', { key: 'restart' }, t0(props, 'explainRestart')),
    ]),
  ])
}

// ---- src/client/90-apply.js ----
// 插件入口：注册文案、侧边栏两个入口、设置页区块。
//
// 槽位选择（都在 dsh-client-ui-layout / settings 已声明的公共槽上，不改动宿主 UI）：
//   · sidebar.footer.action ×2 —— 强刷 / 重启的一键入口，宽窄两种侧边栏都能点到；
//   · settings.section        —— 运行状态 + 动作 + 说明，方便知道「为什么要点它」。

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-gui-control: copy dictionaries')

  const connection = ctx.get('connection')
  const t = ctx.locale.bind(NS)
  const api = rpc(connection)
  const injected = () => ({ rpc: api, t })

  installStyles(ctx)

  // 侧边栏底部：两个独立注册（list 槽每项需要唯一 id）。order 71/72 排在
  // 其他底部动作之后、系统设置之前的位置感；owner 渲染时注入 { wide }。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'gui-control-refresh',
    order: 71,
    inject: injected,
  }, RefreshFooterAction))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'gui-control-restart',
    order: 72,
    inject: injected,
  }, RestartFooterAction))

  // 设置页区块：状态 + 两个动作 + 说明。label 显示在设置导航里。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'gui-control',
    order: 96,
    label: () => t('nav'),
    inject: injected,
  }, GuiControlSection))
}

exports.apply = apply
exports.inject = inject


return module.exports;
} });
