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
