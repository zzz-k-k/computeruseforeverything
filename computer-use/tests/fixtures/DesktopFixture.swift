import AppKit
import Foundation

final class FixtureApplication: NSApplication {
    override func sendEvent(_ event: NSEvent) {
        if let path=ProcessInfo.processInfo.environment["FIXTURE_EVENT_LOG"] {
            let line="type=\(event.type.rawValue) subtype=\([NSEvent.EventType.appKitDefined, .systemDefined, .applicationDefined, NSEvent.EventType(rawValue:21)!].contains(event.type) ? event.subtype.rawValue : 0) window=\(event.windowNumber) point=\(event.locationInWindow) active=\(isActive) key=\(keyWindow?.windowNumber ?? 0) visible=\(event.window?.isVisible ?? false) mini=\(event.window?.isMiniaturized ?? false)\n"
            if let handle=FileHandle(forWritingAtPath:path) { handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close() }
        }
        super.sendEvent(event)
    }
}

// Isolated manual/integration-test target. Its JSON is written atomically after
// every observed input event, so tests can verify delivery without inspecting
// or modifying any existing application.
final class FixtureTextView: NSTextView {
    var observedKey: ((NSEvent) -> Void)?
    override func keyDown(with event: NSEvent) {
        super.keyDown(with: event)
        observedKey?(event)
    }
}

final class FixtureClickView: NSView {
    var clicked: ((Bool) -> Void)?
    override var acceptsFirstResponder: Bool { true }
    override func mouseDown(with event: NSEvent) { clicked?(false) }
    override func rightMouseDown(with event: NSEvent) { clicked?(true) }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.systemBlue.setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 10, yRadius: 10).fill()
        let text = "Click test target"
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: 18), .foregroundColor: NSColor.white]
        let size = text.size(withAttributes: attributes)
        text.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2), withAttributes: attributes)
    }
}

final class FixtureScrollView: NSScrollView {
    var observedScroll: ((NSEvent) -> Void)?
    override func scrollWheel(with event: NSEvent) {
        super.scrollWheel(with: event)
        observedScroll?(event)
    }
}

final class FlippedDocument: NSView {
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        for row in 0..<60 {
            (row % 2 == 0 ? NSColor.controlBackgroundColor : NSColor.windowBackgroundColor).setFill()
            NSRect(x: 0, y: row * 40, width: Int(bounds.width), height: 40).fill()
            "Scroll row \(row + 1)".draw(at: NSPoint(x: 12, y: row * 40 + 10), withAttributes: [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.labelColor])
        }
    }
}

final class FixtureDelegate: NSObject, NSApplicationDelegate, NSTextViewDelegate, NSWindowDelegate {
    let stateURL: URL
    var window: NSWindow!
    var editor: FixtureTextView!
    var clickTarget: FixtureClickView!
    var scroll: FixtureScrollView!
    var leftClicks = 0
    var rightClicks = 0
    var textChanges = 0
    var keyEvents = 0
    var scrollEvents = 0
    var lastKey: [String: Any] = [:]
    var lastScroll: [String: Any] = [:]
    var sequence = 0
    let background = CommandLine.arguments.contains("--background")
    @objc func axClick() { leftClicks += 1; writeState() }

    init(stateURL: URL) { self.stateURL = stateURL }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let menu = NSMenu()
        let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editMenu
        menu.addItem(edit)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 200, y: 150, width: 760, height: 540), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Computer Use — Isolated Input Test"
        window.level = background ? .normal : .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.delegate = self
        window.isReleasedWhenClosed = false
        let content = window.contentView!
        let heading = NSTextField(labelWithString: "Dedicated input test window")
        heading.font = .boldSystemFont(ofSize: 22)
        heading.frame = NSRect(x: 24, y: 486, width: 710, height: 30)
        content.addSubview(heading)
        let axButton = NSButton(title: "AX test button", target: self, action: #selector(axClick))
        axButton.frame = NSRect(x: 540, y: 480, width: 170, height: 34)
        content.addSubview(axButton)
        let instructions = NSTextField(labelWithString: "Only this fixture is used for click, Unicode typing, keys, and scrolling.")
        instructions.frame = NSRect(x: 24, y: 450, width: 710, height: 24)
        content.addSubview(instructions)

        let editorScroll = NSScrollView(frame: NSRect(x: 24, y: 285, width: 710, height: 150))
        editorScroll.borderType = .bezelBorder
        editorScroll.hasVerticalScroller = true
        editor = FixtureTextView(frame: NSRect(x: 0, y: 0, width: 690, height: 150))
        editor.isRichText = false
        editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.isAutomaticDashSubstitutionEnabled = false
        editor.isAutomaticSpellingCorrectionEnabled = false
        editor.font = .systemFont(ofSize: 20)
        editor.string = "Fixture ready"
        editor.delegate = self
        editor.observedKey = { [weak self] event in
            guard let self else { return }
            self.keyEvents += 1
            self.lastKey = ["keyCode": event.keyCode, "characters": event.characters ?? "", "modifiers": event.modifierFlags.rawValue]
            self.writeState()
        }
        editorScroll.documentView = editor
        content.addSubview(editorScroll)

        clickTarget = FixtureClickView(frame: NSRect(x: 24, y: 195, width: 280, height: 64))
        clickTarget.clicked = { [weak self] right in
            guard let self else { return }
            if right { self.rightClicks += 1 } else { self.leftClicks += 1 }
            self.writeState()
        }
        content.addSubview(clickTarget)

        scroll = FixtureScrollView(frame: NSRect(x: 340, y: 24, width: 394, height: 235))
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.documentView = FlippedDocument(frame: NSRect(x: 0, y: 0, width: 370, height: 2400))
        scroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(forName: NSView.boundsDidChangeNotification, object: scroll.contentView, queue: .main) { [weak self] _ in self?.writeState() }
        scroll.observedScroll = { [weak self] event in
            guard let self else { return }
            self.scrollEvents += 1
            self.lastScroll = ["deltaX": event.scrollingDeltaX, "deltaY": event.scrollingDeltaY]
            self.writeState()
        }
        content.addSubview(scroll)
        let scrollLabel = NSTextField(wrappingLabelWithString: "The blue target records left and right clicks.\n\nThe scroll list records wheel events and visible position.")
        scrollLabel.frame = NSRect(x: 24, y: 35, width: 280, height: 140)
        content.addSubview(scrollLabel)

        window.center()
        if !background { window.makeKeyAndOrderFront(nil) } else { window.orderBack(nil) }
        window.makeFirstResponder(editor)
        if !self.background { NSApp.activate(ignoringOtherApps: true) }
        if background { window.orderBack(nil) } else { window.orderFrontRegardless() }
        writeState()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            if self.background { self.window.orderBack(nil) } else { self.window.orderFrontRegardless() }
            if !self.background { self.window.makeKey() }
            if !self.background { NSApp.activate(ignoringOtherApps: true) }
            self.writeState()
        }
    }

    func textDidChange(_ notification: Notification) { textChanges += 1; writeState() }
    func windowDidMove(_ notification: Notification) { if editor != nil { writeState() } }
    func windowDidResize(_ notification: Notification) { if editor != nil { writeState() } }
    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func quartzPoint(_ view: NSView, localPoint: NSPoint? = nil) -> [String: Double] {
        let local = localPoint ?? NSPoint(x: view.bounds.midX, y: view.bounds.midY)
        let windowPoint = view.convert(local, to: nil)
        let screenPoint = window.convertPoint(toScreen: windowPoint)
        // AppKit screen coordinates start at the primary display's bottom-left;
        // Quartz event coordinates start at that display's top-left.
        let primaryTop = NSScreen.screens.first!.frame.maxY
        return ["x": screenPoint.x, "y": primaryTop - screenPoint.y]
    }

    func writeState() {
        guard window != nil, editor != nil, clickTarget != nil, scroll != nil else { return }
        sequence += 1
        let state: [String: Any] = [
            "pid": ProcessInfo.processInfo.processIdentifier,
            "sequence": sequence, "ready": true, "text": editor.string,
            "textChanges": textChanges, "keyEvents": keyEvents, "lastKey": lastKey,
            "leftClicks": leftClicks, "rightClicks": rightClicks,
            "scrollEvents": scrollEvents, "scrollY": scroll.contentView.bounds.origin.y,
            "lastScroll": lastScroll,
            "selection": ["location": editor.selectedRange().location, "length": editor.selectedRange().length],
            "points": ["text": quartzPoint(editor.enclosingScrollView!, localPoint: NSPoint(x: 100, y: 100)), "button": quartzPoint(clickTarget), "scroll": quartzPoint(scroll)],
            "coordinateSpace": "global Quartz points",
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: stateURL, options: .atomic)
        } catch { FileHandle.standardError.write(Data("Fixture state write failed: \(error)\n".utf8)) }
    }
}

@main struct FixtureMain {
    static func main() {
        guard CommandLine.arguments.count >= 2 else {
            FileHandle.standardError.write(Data("Usage: DesktopFixture /absolute/path/to/state.json\n".utf8))
            exit(2)
        }
        let application = FixtureApplication.shared
        let delegate = FixtureDelegate(stateURL: URL(fileURLWithPath: CommandLine.arguments[1]))
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
