import {targeted} from './windows.mjs';
// The Runtime supplies ctx.frames, ctx.macos, and a serialized input queue.
// The macOS bridge exposes the functions in macos.swift.

function fail(code) {
  return Object.assign(new Error(code), { code });
}

// snippet: point
async function resolvePoint({ frame_id, x, y }, ctx) {
  const frame = ctx.frames.get(ctx.sessionId, frame_id);
  if (!frame || frame.expiresAt <= Date.now()) throw fail("stale_frame");
  if (!Number.isInteger(x) || !Number.isInteger(y) ||
      x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    throw fail("coordinate_out_of_bounds");
  }

  if(frame.kind==='browser')throw fail("target_required");
  if(frame.target) throw fail("target_required");
  const layout = await ctx.macos.displayLayout();
  if (layout.version !== frame.layoutVersion) throw fail("stale_frame");
  const { left, top, width, height } = frame.desktopBounds;
  return {
    displayId: frame.displayId,
    x: left + (x + 0.5) * width / frame.width,
    y: top + (y + 0.5) * height / frame.height,
  };
}
// end-snippet

// snippet: screenshot
export async function screenshot({ display_id, target }, ctx) {
  ctx.require("screen");
  if(target) {
    const {png,width,height,desktopBounds,target:resolved}=await ctx.macos.captureWindow(target);
    const frame_id=ctx.frames.add(ctx.sessionId,{width,height,desktopBounds,target:resolved});
    return {result:{frame_id,target:resolved,width,height,captured_at:new Date().toISOString()},images:[{mime_type:'image/png',bytes:png}]};
  }
  const layout = await ctx.macos.displayLayout();
  const display = display_id ?? layout.mainDisplayId;
  const { png, width, height, desktopBounds } = await ctx.macos.captureDisplay(display);
  const current = await ctx.macos.displayLayout();
  if (current.version !== layout.version) throw fail("display_changed");
  const capturedAt = new Date().toISOString();

  const frameId = ctx.frames.add(ctx.sessionId, {
    displayId: display, width, height, desktopBounds,
    layoutVersion: layout.version,
  });
  return {
    result: { frame_id: frameId, display_id: display, width, height, captured_at: capturedAt },
    images: [{ mime_type: "image/png", bytes: png }],
  };
}
// end-snippet

// snippet: click
export async function click(args, ctx) {
  if(args.target || args.mode==='background')return targeted(args,ctx,'click');
  ctx.require("control");
  if (args.capture_after) ctx.require("screen");
  return ctx.inputQueue.run(async () => {
    ctx.signal?.throwIfAborted();
    const { displayId, x, y } = await resolvePoint(args, ctx);
    ctx.signal?.throwIfAborted();
    await ctx.macos.postClick({ x, y }, args.button === "right");
    const executed = { status: "executed" };

    if (!args.capture_after) return { result: executed, images: [] };
    try {
      const capture = await screenshot({ display_id: displayId }, ctx);
      return { result: { ...executed, ...capture.result }, images: capture.images };
    } catch (error) {
      return {
        result: { ...executed, capture_error: error.code ?? "capture_failed" },
        images: [],
      };
    }
  });
}
// end-snippet

// snippet: type
export async function type(args, ctx) {
  const {text}=args;
  if(args.target || args.mode==='background')return targeted(args,ctx,'type');
  ctx.require("control");
  if (typeof text !== "string" || text.length > 4096) throw fail("invalid_text");
  return ctx.inputQueue.run(async () => {
    ctx.signal?.throwIfAborted();
    await ctx.macos.postText(text);
    return { result: { status: "executed" }, images: [] };
  });
}
// end-snippet

// snippet: press_key
export async function pressKey(args, ctx) {
  const {key}=args;
  if(args.target || args.mode==='background')return targeted(args,ctx,'press_key');
  ctx.require("control");
  return ctx.inputQueue.run(async () => {
    ctx.signal?.throwIfAborted();
    await ctx.macos.postKey(key);
    return { result: { status: "executed" }, images: [] };
  });
}
// end-snippet

// snippet: scroll
export async function scroll(args, ctx) {
  if(args.target || args.mode==='background')return targeted(args,ctx,'scroll');
  ctx.require("control");
  return ctx.inputQueue.run(async () => {
    ctx.signal?.throwIfAborted();
    const { x, y } = await resolvePoint(args, ctx);
    ctx.signal?.throwIfAborted();
    await ctx.macos.postScroll({ x, y }, args.delta_x ?? 0, args.delta_y);
    return { result: { status: "executed" }, images: [] };
  });
}
// end-snippet
