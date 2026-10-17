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
