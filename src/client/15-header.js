// 会话头右上角（conversation.session.header.utilities）的两个图标按钮。
//
// 槽契约：list / session，按 order 升序，容器 gap:8px、margin-left:20px，右对齐；
// owner 不传额外值。这一排现在有三个按钮（open-in-app、会话日志「更多」、右上角展开），
// 所以 refresh 用 -40、restart 用 -39 排在它们左侧；restart 带 margin-right:8px，
// 与本排那三个按钮之间再多留一点空隙（"隔开一点点"）。
//
// 行为与设置页完全一致：
//   · 强刷点了就做（不确认，最坏就是整页重载一次）；
//   · 重启两步确认：第一次只「武装」，4 秒内再点才执行，超时自动取消；
//     非桌面端没有重启桥，按钮禁用并在 title 里说明原因。
// 差别只在呈现：这里是 24px 图标按钮，武装时图标变红 + 下方浮出提示气泡（不占布局）。

function HeaderIconButton(props) {
  const h = React.createElement
  return h('button', {
    type: 'button',
    className: props.gapAfter === true ? 'dsh-gui-icon-btn dsh-gui-gap-after' : 'dsh-gui-icon-btn',
    'data-tone': props.tone || 'normal',
    'data-armed': props.armed === true ? 'true' : 'false',
    'data-spin': props.spinning === true ? 'true' : 'false',
    title: props.title,
    'aria-label': props.ariaLabel,
    disabled: props.disabled === true,
    onClick: props.onClick,
  }, h(props.icon, { size: 15 }))
}

// 武装/错误提示：绝对定位在按钮下方，pointer-events:none，不推动这一排的布局。
function HeaderHint(props) {
  const h = React.createElement
  if (props.text === '') return null
  return h('span', {
    className: 'dsh-gui-header-hint',
    'data-tone': props.tone || 'danger',
    role: 'status',
  }, props.text)
}

function HeaderRefreshAction(props) {
  const h = React.createElement
  const [busy, setBusy] = useState(false)

  const onClick = () => {
    if (busy === true) return Promise.resolve()
    setBusy(true)
    const pending = hardReload()
    if (pending && typeof pending.catch === 'function') pending.catch(() => setBusy(false))
    return pending
  }

  const label = t0(props, 'headerRefreshAria')
  return h('span', { className: 'dsh-gui-icon-slot' },
    h(HeaderIconButton, {
      icon: RefreshIcon,
      title: t0(props, 'footerRefreshHint'),
      ariaLabel: label,
      spinning: busy,
      disabled: busy,
      onClick,
    }))
}

function HeaderRestartAction(props) {
  const h = React.createElement
  const [armed, setArmed] = useArmed(CONFIRM_WINDOW_MS)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const bridge = desktopBridge()

  // 失败提示 6 秒后自动消失；成功时页面会被重载，走不到这里。
  useEffect(() => {
    if (note === '') return undefined
    const id = setTimeout(() => setNote(''), 6000)
    return () => clearTimeout(id)
  }, [note])

  const onClick = () => {
    if (busy === true || !desktopBridge()) return Promise.resolve()
    if (armed !== true) {
      setArmed(true)
      return Promise.resolve()
    }
    setArmed(false)
    setBusy(true)
    setNote('')
    const pending = restartHarness()
    if (pending && typeof pending.then === 'function') {
      pending.then(
        () => setBusy(false),
        (error) => {
          setBusy(false)
          setNote(t0(props, 'restartFailed', { detail: errorText(error) }))
        },
      )
    }
    return pending
  }

  const desktop = bridge !== null
  const label = busy
    ? t0(props, 'restartDoing')
    : armed
      ? t0(props, 'headerConfirmHint', { seconds: Math.round(CONFIRM_WINDOW_MS / 1000) })
      : t0(props, 'headerRestartAria')
  const title = !desktop
    ? t0(props, 'restartDesktopOnly')
    : armed
      ? t0(props, 'confirmHint', { seconds: Math.round(CONFIRM_WINDOW_MS / 1000) })
      : t0(props, 'footerRestartHint')
  const hint = armed
    ? t0(props, 'headerConfirmHint', { seconds: Math.round(CONFIRM_WINDOW_MS / 1000) })
    : note

  return h('span', { className: 'dsh-gui-icon-slot' }, [
    h(HeaderIconButton, {
      key: 'button',
      icon: PowerIcon,
      title,
      ariaLabel: label,
      tone: armed || busy ? 'danger' : 'normal',
      armed,
      disabled: !desktop || busy,
      gapAfter: true,
      onClick,
    }),
    h(HeaderHint, { key: 'hint', text: hint, tone: 'danger' }),
  ])
}
