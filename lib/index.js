// dsh-gui-control —— node 半侧（Host）。
//
// 这一半刻意很小：GUI 侧的「强刷」是页面自己的事，「重启」只有 DSH Desktop 的
// preload 桥能做（window.dshDesktop.restartHarness → 主进程 IPC harness:restart）。
// 插件在 Host 侧没有、也不该有退出/重启自己的口子——那属于桌面壳的进程监督。
//
// 这里只提供只读状态，供设置页显示「改完代码到底加载的是哪一版、Host 跑了多久」，
// 这正是排查「改了但没生效」时最先要看的两件事。RPC 走 connection.fetch.register
// 在 /api 通道上开一个路由，前端用 connection.rpc.call('/api', ...) 调用。

import { readFileSync } from 'node:fs'

export const name = 'dsh-gui-control'

const RPC_PREFIX = 'dsh-gui-control.'

// 进程级启动时刻：模块在 Host 启动时加载一次，所以这里就是「Host 已运行多久」的起点。
const STARTED_AT = Date.now()

// 版本只从 package.json 读，不写第二处：运行中的代码永远能报出自己是哪一版。
// Node 对 JSON import 的态度随 loader 而变，直接读文件最稳。
function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// ---------- RPC 信封（与 /api 通道的 client-request / server-response 约定一致） ----------

function readEnvelope(body) {
  if (typeof body !== 'object' || body === null) return undefined
  if (body.type !== 'client-request' || typeof body.rpcId !== 'string' || typeof body.method !== 'string') return undefined
  return { rpcId: body.rpcId, method: body.method, payload: body.payload }
}

function serverResponse(rpcId, result) {
  return Response.json({ type: 'server-response', rpcId, result })
}

function rpcError(rpcId, code, message) {
  return serverResponse(rpcId, { ok: false, error: { code, message, details: { issues: [] } } })
}

function fetchRouteFor(endpoint, handler) {
  const method = `${RPC_PREFIX}${endpoint}`
  return {
    path: `/api/${method}`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const envelope = readEnvelope(body)
      if (envelope === undefined) {
        return rpcError('invalid-request', 'bad-request', 'invalid client-request message')
      }
      if (envelope.method !== method) {
        return rpcError(envelope.rpcId, 'bad-request', `method mismatch for ${method}`)
      }
      try {
        return serverResponse(envelope.rpcId, await handler(envelope.payload, request.signal))
      } catch (error) {
        return rpcError(envelope.rpcId, 'internal', error instanceof Error ? error.message : String(error))
      }
    },
  }
}

// ---------- 插件入口 ----------

export function apply(ctx) {
  const version = readVersion()

  // 一行启动日志：重启后能在 Host 日志里确认这一版真的加载了（排查「改了没生效」）。
  try {
    ctx.logger?.info?.(`[dsh-gui-control] v${version} ready (pid ${process.pid})`)
  } catch {
    // 日志不可用不影响功能。
  }

  const handlers = {
    // 只读状态；任何字段取不到都给空值，绝不失败。
    state: async () => ({
      ok: true,
      value: {
        version,
        pid: process.pid,
        startedAt: STARTED_AT,
        uptimeMs: Math.max(0, Date.now() - STARTED_AT),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        profile: typeof process.env.DSH_PROFILE === 'string' ? process.env.DSH_PROFILE : '',
      },
    }),
  }

  ctx.inject(['connection'], (connCtx) => {
    const connection = connCtx.get('connection')
    if (!connection || typeof connection.fetch?.register !== 'function') return
    const register = connection.fetch.register
    for (const [endpoint, handler] of Object.entries(handlers)) {
      connCtx.effect(
        () => register(fetchRouteFor(endpoint, handler)),
        `dsh-gui-control: /api/${RPC_PREFIX}${endpoint}`,
      )
    }
  })
}
