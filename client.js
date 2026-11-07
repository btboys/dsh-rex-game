window.__ModuleLoader__.load({
  id: 'dsh-whale-break',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'rex-game'
    const zh = {
      hint: '拖动移动 · 空格 / 点击 起跳',
      enable: '开启等待小鲸鱼',
      disable: '关闭等待小鲸鱼',
      reset: '双击回到顶部居中',
    }
    const en = {
      hint: 'Drag to move · Space / click to jump',
      enable: 'Turn the whale game on',
      disable: 'Turn the whale game off',
      reset: 'Double-click to reset position',
    }

    // ---------------------------------------------------------------- game core
    const W = 240
    const H = 120
    const GROUND = 98
    const WHALE = { x: 22, w: 36, h: 22 }
    const FLOOR_Y = GROUND - WHALE.h
    const GRAVITY = 2600
    const JUMP_VELOCITY = -540
    const SPEED_START = 200
    const SPEED_MAX = 320
    const SPEED_ACCEL = 3
    const PANEL_WIDTH = 640

    function readBest() {
      try {
        const value = Number(localStorage.getItem('dsh-rex-best'))
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
      } catch (_error) {
        return 0
      }
    }

    function saveBest(value) {
      try {
        localStorage.setItem('dsh-rex-best', String(Math.floor(value)))
      } catch (_error) {}
    }

    const ENABLED_KEY = 'dsh-rex-enabled'
    const enabledStore = {
      value: undefined,
      listeners: new Set(),
      get() {
        if (enabledStore.value === undefined) {
          try {
            enabledStore.value = localStorage.getItem(ENABLED_KEY) !== '0'
          } catch (_error) {
            enabledStore.value = true
          }
        }
        return enabledStore.value
      },
      subscribe(listener) {
        enabledStore.listeners.add(listener)
        return () => enabledStore.listeners.delete(listener)
      },
      set(next) {
        enabledStore.value = next
        try {
          localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
        } catch (_error) {}
        for (const listener of enabledStore.listeners) listener()
      },
    }

    function createWorld() {
      const bubbles = []
      for (let index = 0; index < 9; index += 1) {
        bubbles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.8 + Math.random() * 2.2,
          vy: -10 - Math.random() * 16,
          trail: false,
        })
      }
      const fish = []
      for (let index = 0; index < 4; index += 1) {
        fish.push({ x: Math.random() * W, y: 16 + Math.random() * 52, v: 6 + Math.random() * 12 })
      }
      return {
        phase: 'ready',
        y: FLOOR_Y,
        vy: 0,
        speed: SPEED_START,
        score: 0,
        best: readBest(),
        ground: 0,
        leg: 0,
        spawnIn: SPEED_START * (1.5 + Math.random() * 0.6),
        corals: [],
        fish,
        bubbles,
        bubbleIn: 0.2,
      }
    }

    function resetWorld(world) {
      const fresh = createWorld()
      world.phase = fresh.phase
      world.y = fresh.y
      world.vy = fresh.vy
      world.speed = fresh.speed
      world.score = 0
      world.best = fresh.best
      world.ground = 0
      world.leg = 0
      world.spawnIn = fresh.spawnIn
      world.corals = []
      world.fish = fresh.fish
      world.bubbles = fresh.bubbles
      world.bubbleIn = fresh.bubbleIn
    }

    function jump(world) {
      if (world.phase === 'over') resetWorld(world)
      if (world.phase === 'ready') world.phase = 'run'
      if (Math.abs(world.y - FLOOR_Y) < 0.5) world.vy = JUMP_VELOCITY
    }

    function whaleBox(world) {
      return { x: WHALE.x + 5, y: world.y + 5, w: WHALE.w - 10, h: WHALE.h - 8 }
    }

    function coralBox(coral) {
      return { x: coral.x - 1, y: GROUND - coral.h + 3, w: 10, h: coral.h - 3 }
    }

    function hit(a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    }

    function stepWorld(world, dt) {
      for (const bubble of world.bubbles) {
        bubble.y += bubble.vy * dt
        bubble.x -= world.speed * 0.4 * dt + Math.sin(bubble.y * 0.04) * 4 * dt
        if (bubble.y < -6) {
          bubble.y = H + 4 + Math.random() * 18
          bubble.x = Math.random() * W
          bubble.trail = false
        }
        if (bubble.x < -8) bubble.x = W + 8
      }
      for (const fish of world.fish) {
        fish.x -= (world.speed * 0.12 + fish.v) * dt
        if (fish.x < -12) {
          fish.x = W + 10 + Math.random() * 20
          fish.y = 16 + Math.random() * 52
        }
      }
      if (world.phase !== 'run') return

      world.speed = Math.min(SPEED_MAX, world.speed + SPEED_ACCEL * dt)
      world.score += world.speed * dt * 0.06
      world.ground += world.speed * dt
      world.leg += (world.speed * dt) / 24

      world.vy += GRAVITY * dt
      world.y += world.vy * dt
      if (world.y > FLOOR_Y) {
        world.y = FLOOR_Y
        world.vy = 0
      }

      world.bubbleIn -= dt
      if (world.bubbleIn <= 0) {
        world.bubbles.push({
          x: WHALE.x + 3,
          y: world.y + 9 + Math.random() * 8,
          r: 0.9 + Math.random() * 1.6,
          vy: -16 - Math.random() * 14,
          trail: true,
        })
        if (world.bubbles.length > 26) world.bubbles.shift()
        world.bubbleIn = 0.16 + Math.random() * 0.12
      }

      world.spawnIn -= world.speed * dt
      if (world.spawnIn <= 0) {
        world.corals.push({ x: W + 14, h: 22 + Math.random() * 12, tint: Math.floor(Math.random() * 4) })
        world.spawnIn = world.speed * (0.95 + Math.random() * 0.75)
      }
      for (const coral of world.corals) coral.x -= world.speed * dt
      world.corals = world.corals.filter((coral) => coral.x > -24)

      const box = whaleBox(world)
      for (const coral of world.corals) {
        if (!hit(box, coralBox(coral))) continue
        world.phase = 'over'
        world.best = Math.max(world.best, Math.floor(world.score))
        saveBest(world.best)
        break
      }
    }

    // ---------------------------------------------------------------- painting
    const ART = {
      coral: ['#ff7a9c', '#ffb15e', '#9b7bff', '#4fd6b8'],
      fish: 'rgba(170, 220, 255, 0.22)',
      bubble: 'rgba(220, 240, 255, 0.55)',
      trailBubble: 'rgba(140, 180, 255, 0.5)',
    }

    function drawCoral(ctx2d, coral) {
      const x = coral.x
      const height = coral.h
      const base = GROUND - 1
      const color = ART.coral[(coral.tint ?? 0) % ART.coral.length]
      ctx2d.save()
      ctx2d.strokeStyle = color
      ctx2d.globalAlpha = 0.95
      ctx2d.lineWidth = 2.6
      ctx2d.lineCap = 'round'
      ctx2d.beginPath()
      ctx2d.moveTo(x, base)
      ctx2d.quadraticCurveTo(x + 3, base - height * 0.5, x + 1, base - height)
      ctx2d.moveTo(x + 1, base - height * 0.42)
      ctx2d.quadraticCurveTo(x - 3, base - height * 0.55, x - 5, base - height * 0.78)
      ctx2d.moveTo(x + 2, base - height * 0.58)
      ctx2d.quadraticCurveTo(x + 6, base - height * 0.64, x + 7, base - height * 0.86)
      ctx2d.stroke()

      ctx2d.fillStyle = color
      ctx2d.globalAlpha = 0.55
      for (const [dx, dy] of [
        [1, -height],
        [-5, -height * 0.78],
        [7, -height * 0.86],
      ]) {
        ctx2d.beginPath()
        ctx2d.arc(x + dx, base + dy, 1.7, 0, Math.PI * 2)
        ctx2d.fill()
      }
      ctx2d.restore()
    }

    function drawWhale(ctx2d, world) {
      const x = WHALE.x
      const airborne = world.y < FLOOR_Y - 0.5
      const bob = airborne ? 0 : Math.sin(world.leg * 1.7) * 1.1
      const y = world.y + bob
      const wag = Math.sin(world.leg * 1.9) * (airborne ? 0.38 : 0.22)

      ctx2d.save()
      ctx2d.translate(x + 5, y + 11)
      ctx2d.rotate(wag)
      ctx2d.fillStyle = '#4d6bfe'
      ctx2d.beginPath()
      ctx2d.moveTo(1, 0)
      ctx2d.quadraticCurveTo(-6, -8, -10, -8)
      ctx2d.quadraticCurveTo(-7, -2, -7, 2)
      ctx2d.quadraticCurveTo(-10, 8, -9, 9)
      ctx2d.quadraticCurveTo(-4, 5, 1, 3)
      ctx2d.closePath()
      ctx2d.fill()
      ctx2d.restore()

      if (airborne) {
        ctx2d.fillStyle = 'rgba(225, 240, 255, 0.85)'
        for (const [dx, dy, radius] of [
          [22, -2, 1.8],
          [26, -6, 1.4],
          [19, -9, 1.1],
        ]) {
          ctx2d.beginPath()
          ctx2d.arc(x + dx, y + dy, radius, 0, Math.PI * 2)
          ctx2d.fill()
        }
      }

      const body = ctx2d.createLinearGradient(0, y, 0, y + 22)
      body.addColorStop(0, '#8b9dff')
      body.addColorStop(0.5, '#5b77ff')
      body.addColorStop(1, '#3550cc')
      ctx2d.fillStyle = body
      ctx2d.beginPath()
      ctx2d.ellipse(x + 18, y + 11, 16, 10.5, 0, 0, Math.PI * 2)
      ctx2d.fill()

      ctx2d.fillStyle = '#e6eeff'
      ctx2d.globalAlpha = 0.92
      ctx2d.beginPath()
      ctx2d.ellipse(x + 19, y + 15.5, 10.5, 4.8, 0, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.globalAlpha = 1

      ctx2d.fillStyle = '#5b77ff'
      ctx2d.beginPath()
      ctx2d.ellipse(x + 13, y + 16, 5, 2.6, -0.5, 0, Math.PI * 2)
      ctx2d.fill()

      ctx2d.fillStyle = '#ffffff'
      ctx2d.beginPath()
      ctx2d.arc(x + 28, y + 8, 2.7, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.fillStyle = '#0d1830'
      ctx2d.beginPath()
      ctx2d.arc(x + 28.9, y + 8.2, 1.35, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx2d.beginPath()
      ctx2d.arc(x + 28.4, y + 7.6, 0.6, 0, Math.PI * 2)
      ctx2d.fill()

      ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx2d.lineWidth = 1.1
      ctx2d.lineCap = 'round'
      ctx2d.beginPath()
      ctx2d.arc(x + 29, y + 11.5, 3.4, 0.15 * Math.PI, 0.55 * Math.PI)
      ctx2d.stroke()
    }

    function pad(value) {
      return String(Math.floor(value)).padStart(5, '0')
    }

    function paintWorld(ctx2d, world, scale) {
      ctx2d.setTransform(scale, 0, 0, scale, 0, 0)
      ctx2d.clearRect(0, 0, W, H)

      const water = ctx2d.createLinearGradient(0, 0, 0, GROUND)
      water.addColorStop(0, '#0a1a45')
      water.addColorStop(0.55, '#0e4f83')
      water.addColorStop(1, '#0f7196')
      ctx2d.fillStyle = water
      ctx2d.fillRect(0, 0, W, GROUND)

      ctx2d.fillStyle = 'rgba(255, 255, 255, 0.05)'
      for (const shaft of [34, 118, 194]) {
        ctx2d.beginPath()
        ctx2d.moveTo(shaft, 0)
        ctx2d.lineTo(shaft + 26, 0)
        ctx2d.lineTo(shaft + 74, GROUND)
        ctx2d.lineTo(shaft + 50, GROUND)
        ctx2d.closePath()
        ctx2d.fill()
      }

      for (const fish of world.fish) {
        ctx2d.fillStyle = ART.fish
        ctx2d.beginPath()
        ctx2d.ellipse(fish.x, fish.y, 4.2, 2.2, 0, 0, Math.PI * 2)
        ctx2d.fill()
        ctx2d.beginPath()
        ctx2d.moveTo(fish.x - 3.4, fish.y)
        ctx2d.lineTo(fish.x - 7.6, fish.y - 2.4)
        ctx2d.lineTo(fish.x - 7.6, fish.y + 2.4)
        ctx2d.closePath()
        ctx2d.fill()
      }

      const sand = ctx2d.createLinearGradient(0, GROUND, 0, H)
      sand.addColorStop(0, '#e8b877')
      sand.addColorStop(1, '#a4683a')
      ctx2d.fillStyle = sand
      ctx2d.fillRect(0, GROUND, W, H - GROUND)
      ctx2d.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx2d.fillRect(0, GROUND, W, 1)
      ctx2d.fillStyle = 'rgba(120, 70, 30, 0.35)'
      for (let x = -((world.ground * 0.6) % 40); x < W; x += 40) {
        ctx2d.fillRect(x + 6, GROUND + 7, 2, 2)
        ctx2d.fillRect(x + 22, GROUND + 13, 2, 2)
        ctx2d.fillRect(x + 33, GROUND + 5, 2, 2)
      }

      for (const coral of world.corals) drawCoral(ctx2d, coral)
      drawWhale(ctx2d, world)

      for (const bubble of world.bubbles) {
        ctx2d.fillStyle = bubble.trail ? ART.trailBubble : ART.bubble
        ctx2d.beginPath()
        ctx2d.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2)
        ctx2d.fill()
        if (!bubble.trail) {
          ctx2d.fillStyle = 'rgba(255, 255, 255, 0.8)'
          ctx2d.beginPath()
          ctx2d.arc(bubble.x - bubble.r * 0.3, bubble.y - bubble.r * 0.3, bubble.r * 0.3, 0, Math.PI * 2)
          ctx2d.fill()
        }
      }

      ctx2d.save()
      ctx2d.shadowColor = 'rgba(3, 10, 28, 0.6)'
      ctx2d.shadowBlur = 4
      ctx2d.fillStyle = '#ffffff'
      ctx2d.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx2d.textAlign = 'right'
      ctx2d.fillText('HI ' + pad(world.best) + '   ' + pad(world.score), W - 10, 17)
      ctx2d.restore()

      if (world.phase === 'over') {
        ctx2d.fillStyle = 'rgba(5, 13, 34, 0.58)'
        ctx2d.fillRect(0, 0, W, H)
        ctx2d.save()
        ctx2d.shadowColor = 'rgba(0, 0, 0, 0.5)'
        ctx2d.shadowBlur = 6
        ctx2d.fillStyle = '#ffffff'
        ctx2d.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx2d.textAlign = 'center'
        ctx2d.fillText('GAME OVER', W / 2, 58)
        ctx2d.restore()
      }
      ctx2d.textAlign = 'left'
    }

    // ---------------------------------------------------------------- react
    function useTranslate(locale) {
      React.useSyncExternalStore(
        (listener) => locale.subscribe(listener),
        () => locale.getSnapshot().revision,
      )
      return React.useMemo(() => locale.bind(NS), [locale])
    }

    function useEnabled() {
      return React.useSyncExternalStore(enabledStore.subscribe, enabledStore.get)
    }

    function RexDockEntry(props) {
      const status = props.useSessionStatus((all) => all.get(props.sessionId))
      const enabled = useEnabled()
      const waiting = enabled && status !== undefined && status.running === true && status.pendingInteraction === undefined
      const t = useTranslate(props.locale)

      const canvasRef = React.useRef(null)
      const loopRef = React.useRef(null)
      const [pos, setPos] = React.useState(undefined)
      const dragRef = React.useRef(null)

      const finishDrag = () => {
        const drag = dragRef.current
        if (!drag) return
        dragRef.current = null
        window.removeEventListener('pointermove', drag.move)
        window.removeEventListener('pointerup', drag.end)
        window.removeEventListener('pointercancel', drag.end)
      }

      const resetPos = () => setPos(undefined)

      const startDrag = (event) => {
        if (event.button !== 0) return
        const rect = event.currentTarget.parentElement.getBoundingClientRect()
        const drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, w: rect.width, h: rect.height }
        drag.move = (moveEvent) => {
          const next = {
            x: Math.max(0, Math.min(moveEvent.clientX - drag.dx, window.innerWidth - drag.w)),
            y: Math.max(0, Math.min(moveEvent.clientY - drag.dy, window.innerHeight - drag.h)),
          }
          setPos(next)
        }
        drag.end = () => finishDrag()
        dragRef.current = drag
        event.preventDefault()
        window.addEventListener('pointermove', drag.move)
        window.addEventListener('pointerup', drag.end)
        window.addEventListener('pointercancel', drag.end)
      }

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || typeof canvas.getContext !== 'function') return undefined
        const ctx2d = canvas.getContext('2d')
        const world = createWorld()
        let raf = 0
        let last = 0
        let active = false
        let scale = 1

        const resize = () => {
          const width = canvas.getBoundingClientRect().width || 480
          const ratio = Math.min(2, window.devicePixelRatio || 1)
          canvas.width = Math.round(width * ratio)
          canvas.height = Math.round((width / 2) * ratio)
          scale = canvas.width / W
        }
        const paint = () => paintWorld(ctx2d, world, scale)
        const frame = (now) => {
          if (!active) return
          const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
          last = now
          stepWorld(world, dt)
          paint()
          raf = requestAnimationFrame(frame)
        }
        const stop = () => {
          active = false
          cancelAnimationFrame(raf)
        }
        const onResize = () => {
          if (!active) return
          resize()
          paint()
        }
        window.addEventListener('resize', onResize)

        loopRef.current = {
          show() {
            if (world.phase === 'ready' || world.phase === 'over') {
              resetWorld(world)
              world.phase = 'run'
            }
            resize()
            paint()
            if (active) return
            active = true
            last = performance.now()
            raf = requestAnimationFrame(frame)
          },
          hide: stop,
          tap() {
            jump(world)
            if (!active) paint()
          },
          dispose: stop,
        }
        return () => {
          window.removeEventListener('resize', onResize)
          stop()
          loopRef.current = null
        }
      }, [])

      React.useEffect(() => () => finishDrag(), [])

      React.useEffect(() => {
        const loop = loopRef.current
        if (!loop) return
        if (waiting) {
          setPos(undefined)
          loop.show()
        } else {
          loop.hide()
        }
      }, [waiting])

      React.useEffect(() => {
        if (!waiting) return undefined
        const onKey = (event) => {
          if (event.isComposing || event.keyCode === 229) return
          if (event.code !== 'Space' && event.key !== 'ArrowUp' && event.key !== 'w' && event.key !== 'W') return
          // Shift+Space stays a literal space so a message can still be typed mid-turn.
          if (event.shiftKey) return
          event.preventDefault()
          event.stopPropagation()
          loopRef.current?.tap()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [waiting])

      const panelStyle = { display: waiting ? 'block' : 'none' }
      if (pos) {
        panelStyle.left = pos.x + 'px'
        panelStyle.top = pos.y + 'px'
        panelStyle.transform = 'none'
      }

      return ReactDOM.createPortal(
        h(
          'div',
          { className: 'dre-wrap', style: panelStyle, 'aria-hidden': waiting ? undefined : 'true' },
          h('canvas', {
            ref: canvasRef,
            className: 'dre-canvas',
            role: 'img',
            'aria-label': t('hint'),
            onPointerDown: (event) => {
              event.preventDefault()
              loopRef.current?.tap()
            },
          }),
          h(
            'p',
            {
              className: 'dre-hint',
              title: t('reset'),
              onPointerDown: startDrag,
              onDoubleClick: resetPos,
            },
            t('hint'),
          ),
        ),
        document.body,
      )
    }

    function RexToggle(props) {
      const enabled = useEnabled()
      const t = useTranslate(props.locale)
      const label = enabled ? t('disable') : t('enable')
      return h(
        'button',
        {
          type: 'button',
          className: enabled ? 'dre-toggle dre-toggle-on' : 'dre-toggle',
          title: label,
          'aria-label': label,
          'aria-pressed': enabled,
          onClick: () => enabledStore.set(!enabled),
        },
        h(
          'svg',
          { viewBox: '0 0 24 24', width: 17, height: 17, 'aria-hidden': true, fill: 'currentColor' },
          h('ellipse', { cx: 11, cy: 14, rx: 7, ry: 4.6 }),
          h('path', { d: 'M4.4 12.6 1.6 9.8c1.9-.3 3.7.4 4.9 1.9z' }),
          h('path', { d: 'M10.4 9.6c.7-1.5 1.8-2.4 3.3-2.6-.5 1.1-1.2 1.9-2.3 2.5z' }),
          h('circle', { cx: 16.4, cy: 6.4, r: 1.5 }),
          h('circle', { cx: 19.2, cy: 4.2, r: 1 }),
        ),
      )
    }

    const CSS = [
      '.dre-wrap{position:fixed;top:88px;left:50%;transform:translateX(-50%);z-index:100;width:min(' + PANEL_WIDTH + 'px,calc(100vw - 40px));border:1px solid rgba(120,150,220,.28);border-radius:18px;background:#071127;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.24));overflow:hidden;user-select:none;-webkit-user-select:none;animation:dre-fade .18s ease-out}',
      '.dre-wrap::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#ff7a9c,#4d6bfe 45%,#4fd6b8);opacity:.9}',
      '.dre-canvas{display:block;width:100%;height:auto;aspect-ratio:2/1;cursor:pointer;touch-action:manipulation}',
      '.dre-hint{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:8px 12px 9px;font-size:12px;letter-spacing:.02em;line-height:1.3;color:#a9c2ee;background:linear-gradient(180deg,#0b1c3d,#071127);border-top:1px solid rgba(120,150,220,.16);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}',
      '.dre-hint:active{cursor:grabbing}',
      '.dre-hint::before{content:"";width:16px;height:10px;flex:none;background:radial-gradient(circle,currentColor 1px,transparent 1.4px) 0 0/5px 5px repeat;opacity:.5}',
      '.dre-toggle{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dre-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary)}',
      '.dre-toggle-on{color:var(--dsw-alias-brand-primary)}',
      '.dre-toggle-on:hover{color:var(--dsw-alias-brand-primary)}',
      '.dre-toggle svg{display:block}',
      '@keyframes dre-fade{from{opacity:0}to{opacity:1}}',
      '@media (prefers-reduced-motion:reduce){.dre-wrap{animation:none}}',
    ].join('')

    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = CSS
      document.head.append(style)
    }

    // Run the pure game core in Node (see test/selfcheck.mjs); absent in the browser.
    if (typeof globalThis.__REX_SELFTEST__ === 'function') {
      globalThis.__REX_SELFTEST__({ W, H, GROUND, FLOOR_Y, createWorld, resetWorld, jump, stepWorld, whaleBox, coralBox, hit, paintWorld })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'rex-game: locale dictionary')
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'whale-toggle',
              order: 30,
              inject: () => ({ locale: ctx.locale }),
            },
            RexToggle,
          ),
        )
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'whale-break',
              order: 40,
              inject: () => ({ locale: ctx.locale }),
            },
            RexDockEntry,
          ),
        )
      },
    }
  },
})
