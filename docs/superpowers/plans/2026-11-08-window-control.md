# Window Control Implementation Plan

Goal: Implement local window observation and targeted operations, validate against an isolated native fixture, and replace draft documentation with accurate contracts.
Architecture: Extend the existing Swift bridge and shared Runtime; all transports use the registry. ScreenCaptureKit supplies window frames; the upstream pipeline supplies scoring and sheets. AX controls and process-targeted events expose explicit execution outcomes.
Spec: computer-use-docs/src/tool-docs/background.mjs
Constraints: local only; preserve old desktop calls; no silent foreground fallback; no claim that synthetic focus is implemented from symbols alone.
Review focus: stale targets, canceled streams, cross-session handles, dispatched-but-unverified operations, focus interference.

- [x] Native discovery, window capture and AX state: add window-control.swift, compile with existing bridge; test invalid targets and fixture snapshots.
- [x] Shared tools: target schema, window frames, action dispatch, AX set_value and capabilities; test identity/geometry rejection and mode handling.
- [x] Continuous window source: native stream to upstream pipeline, bounded queues, stop/cancellation; test real capture and concurrent stop.
- [x] Integration: use HTTP, CLI and MCP against isolated fixture; assert effect and focus/cursor observations; document unsupported cases explicitly.
- [x] Documentation: replace draft sections and examples with verified API, rebuild and check links.

## Verification and implementation decisions

- 27 automated tests passed; native build passed.
- Actual CLI, HTTP and MCP acceptance passed; see computer-use/artifacts/window-acceptance.json.
- AX background click/value effects verified in the isolated fixture, with unchanged foreground application and cursor in the successful run.
- Window screenshot and continuous observation passed using snapshot_fallback for the non-visible fixture. SCStream full-frame path has not been separately validated against a visible moving window.
- Background coordinate/keyboard dispatch did not produce fixture effects; disabled with background_unsupported. Explicit foreground remains available. Synthetic focus / focus-steal prevention and a visible virtual cursor are not implemented, and docs state this limitation.
- Independent review found cancellation-before-dispatch, initial-watch-settings, and early-frame startup races. Added regression tests and fixed all three.
- 34 documentation pages built; navigation, anchors and local new-tool pages checked. Draft wording removed from the changed feature pages.
