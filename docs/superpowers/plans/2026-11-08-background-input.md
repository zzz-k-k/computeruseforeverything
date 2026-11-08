# Background input implementation plan

Goal: Implement and locally validate window-directed mouse/keyboard input with bounded synthetic focus and foreground protection.
Spec: user request and existing background tool contract.
Reference: Codex native SynthesizedEvent mouseEvent includes NSEvent windowNumber, CGEvent fields 91/92 and window-local location; notifyAppActivated uses appKitDefined subtype 1, and key-focus-return uses event type 21/subtype 0x8000. These are observed binary details, not complete Swift source.

- [x] Add a failing real-fixture acceptance for coordinate click, Unicode text and shortcuts while another app remains foreground.
- [x] Build independent background event implementation using window-aware NSEvent, process delivery and scoped synthetic focus; keep foreground operations unchanged.
- [x] Guard foreground identity before/through dispatch and clean synthetic focus on all return paths. Do not reactivate an old app if user changes foreground.
- [x] Test target identity, invalid request and foreground changes; run real CLI/HTTP/MCP tests.
- [x] Update actual API docs and report tested scope precisely.

Validation (2026-11-08, macOS 26.2 / arm64):
- 27 automated tests passed.
- `computer-use/artifacts/window-acceptance.json`: real CLI / HTTP / MCP, AX value/button, window left/right click, Unicode, Meta+A, Backspace, capture/stream/stop passed; recorded foreground unchanged and cursor unchanged during the successful run.
- `computer-use/artifacts/background-input-acceptance.json`: directed click/text, invalid key/oversized text without side effects, live foreground-change interruption passed. Only test payload continuation is checked after focus transfer, because physical user typing can occur independently.
- Local documentation built and browser-read; individual click/type/press_key pages contain implementation steps and code.
- Scope: conditional AppKit window support, no background scroll, no global focus-theft blocking or visible virtual cursor. Focus guard aborts; it does not forcibly restore user focus.
- Debugging: fixture event logging initially read subtype on keyboard events (invalid accessor). Fixed instrumentation without overriding input delivery. Live foreground query uses process registry to avoid a potentially cached NSWorkspace value.
