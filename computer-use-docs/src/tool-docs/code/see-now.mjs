// snippet: wiring
export async function loadSeeNow(options) {
  const upstream = await import("dsh-see-now/runner");
  const window = options.window === undefined ? await import("dsh-see-now/window") : options.window;
  return createSeeNow({ ...options, upstream, window });
}

export function createSeeNow({
  upstream, ffmpegPath, window, pickRegion, windowEnv, enableWindow = false, enableAudio = false,
}) {
  const { createRunner, PACES, SCENE_OPTS, SIZES } = upstream;
  const sessions = new Map();

  function session(id) {
    if (!sessions.has(id)) {
      sessions.set(id, {
        lock: Promise.resolve(), runner: null, source: null,
        stopped: false, read: null, epoch: 0, region: null,
        scene: false, pace: "normal", quality: "low",
      });
    }
    return sessions.get(id);
  }

  function locked(state, work) {
    const next = state.lock.then(work);
    state.lock = next.catch(() => {});
    return next;
  }

  function runnerFor(state) {
    state.runner ??= createRunner({ ffmpegPath, enableWindow, enableAudio });
    return state.runner;
  }

  const actions = { start, watch, peek, stop, status, window: showWindow, region };
  return {
    async call(args, ctx) {
      const action = args.action ?? "watch";
      if (!Object.hasOwn(actions, action)) throw fail("invalid_action");
      ctx.signal?.throwIfAborted();
      return actions[action](session(ctx.sessionId), args, ctx);
    },
    async dispose(sessionId) {
      const state = sessions.get(sessionId);
      if (!state) return;
      await stop(state);
      sessions.delete(sessionId);
    },
  };
  // end-snippet

  // snippet: start
  async function start(state, args, ctx) {
    return locked(state, async () => {
      if (state.read) throw fail("capture_busy");
      const source = await sourceFor(state, args, ctx);
      if (state.runner?.status().running) return result({ already: true });
      ctx.signal?.throwIfAborted();
      const settings = configure(state, args, source, ctx);
      const captureSource = source.kind === "screen" && settings.region
        ? { ...source, region: settings.region } : source;
      const runner = runnerFor(state);
      const reply = await runner.start({
        src: captureSource, opts: settings.opts, quality: settings.quality,
      });
      if (ctx.signal?.aborted) {
        runner.stop();
        state.runner = null;
        ctx.signal.throwIfAborted();
      }
      state.source = source;
      state.stopped = false;
      return result(reply);
    });
  }
  // end-snippet

  // snippet: watch
  async function watch(state, args, ctx) {
    const task = await locked(state, async () => {
      if (state.stopped) throw fail("capture_stopped");
      if (state.read) throw fail("capture_busy");
      const source = await sourceFor(state, args, ctx);
      const settings = configure(state, args, source, ctx);
      const cancel = new AbortController();
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, cancel.signal]) : cancel.signal;
      signal.throwIfAborted();
      const src = args.source || !state.source ? source : null;
      state.source = source;

      const done = runnerFor(state).watch({
        src, signal,
        region: source.kind === "screen" ? settings.region : undefined,
        quality: settings.quality, opts: settings.opts,
        seconds: Math.min(args.seconds ?? 300, 860),
        minFrames: settings.scene ? 1 : (args.minFrames ?? 1),
      }).then(({ sheets = [], ...metadata }) => signal.aborted
        ? result({ ok: false, reason: "cancelled" }) : result(metadata, sheets))
        .finally(() => { state.read = null; });
      state.read = { cancel, done };
      return { done };
    });
    return task.done;
  }
  // end-snippet

  // snippet: peek
  async function peek(state, _args, ctx) {
    return locked(state, async () => {
      if (state.read) throw fail("capture_busy");
      if (state.source) await ctx.authorizeSource(state.source);
      ctx.signal?.throwIfAborted();
      const sheets = state.runner?.peek() ?? [];
      return result({ ok: sheets.length > 0, status: sheets.length ? "ready" : "empty" }, sheets);
    });
  }
  // end-snippet

  // snippet: stop
  async function stop(state) {
    return locked(state, async () => {
      state.stopped = true;
      state.epoch++;
      const pending = state.read;
      if (pending) {
        pending.cancel.abort();
        await pending.done.catch(() => {});
      }
      state.runner?.stop();
      state.runner = null;
      state.source = null;
      state.scene = false;
      state.pace = "normal";
      state.quality = "low";
      return result({ stopped: true });
    });
  }
  // end-snippet

  // snippet: status
  async function status(state, _args, ctx) {
    return locked(state, async () => {
      if (state.source) await ctx.authorizeSource(state.source);
      return result({
        ...(state.runner?.status() ?? { running: false, pending: 0 }),
        explicitly_stopped: state.stopped,
      });
    });
  }
  // end-snippet

  // snippet: window
  async function showWindow(_state, { show }, ctx) {
    ctx.require("local_ui");
    if (!window) return result({ available: false });
    const options = { env: windowEnv };
    const change = typeof show === "boolean"
      ? window.setWindowHidden(window.hiddenForShow(show), options)
      : null;
    return result({ available: true, window: window.windowReport(options), change });
  }
  // end-snippet

  // snippet: region
  async function region(state, args, ctx) {
    ctx.require("local_ui");
    await ctx.authorizeSource({ kind: "screen" });
    if (args.region === "off") {
      return locked(state, () => {
        state.epoch++;
        state.region = null;
        return result({ ok: true, region: null });
      });
    }
    if (!pickRegion) return result({ ok: false, reason: "picker_unavailable" });

    const epoch = await locked(state, () => ++state.epoch);
    const picked = await pickRegion();
    return locked(state, () => {
      if (state.epoch !== epoch || ctx.signal?.aborted) {
        return result({ ok: false, reason: "cancelled" });
      }
      if (!picked.ok) return result(picked);
      state.region = ctx.validateRegion(picked.region);
      return result({ ok: true, region: state.region });
    });
  }
  // end-snippet

  // snippet: settings
  async function sourceFor(state, args, ctx) {
    const input = args.source
      ? { kind: args.source, ...(args.source === "file"
        ? { path: args.path, realtime: args.realtime === true } : {}) }
      : state.source ?? { kind: "screen" };
    const source = await ctx.authorizeSource(input);
    const active = state.source;
    if (state.runner?.status().running && active &&
        (active.kind !== source.kind || active.path !== source.path ||
         active.realtime !== source.realtime)) {
      throw fail("capture_active");
    }
    return source;
  }

  function configure(state, args, source, ctx) {
    const scene = args.scene ?? state.scene;
    const pace = args.pace ?? state.pace;
    const quality = args.quality ?? state.quality;
    if (!Object.hasOwn(PACES, pace) || !Object.hasOwn(SIZES, quality)) {
      throw fail("invalid_capture_settings");
    }

    let region = state.region;
    if (args.region !== undefined) {
      if (source.kind !== "screen") throw fail("bad_region");
      if (args.region === "off") region = null;
      else {
        const [x, y, w, h] = args.region.split(",").map(Number);
        region = ctx.validateRegion({ x, y, w, h });
      }
    }
    Object.assign(state, { scene, pace, quality, region });
    const preset = scene ? PACES.dense : PACES[pace];
    const fileDefault = source.kind === "file" && args.pace === undefined && pace === "normal";
    const opts = {
      ...(scene ? SCENE_OPTS : preset.pipeline),
      cutAbs: fileDefault ? PACES.dense.cutAbs : preset.cutAbs,
    };
    return { scene, quality, region, opts };
  }
  // end-snippet
}

// snippet: result
function result(metadata, sheets = []) {
  return {
    result: {
      ...metadata,
      ...(sheets.length ? { sheets: sheets.map(({ png, ...sheet }) => sheet) } : {}),
    },
    images: sheets.map(({ png }) => ({ mime_type: "image/png", bytes: png })),
  };
}

function fail(code) {
  return Object.assign(new Error(code), { code });
}
// end-snippet
