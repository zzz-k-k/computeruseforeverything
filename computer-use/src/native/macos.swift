import Foundation
import ApplicationServices
import Carbon
import CryptoKit
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

struct BridgeError: Error {
    let code: String
    let message: String
    init(_ code: String, _ message: String) { self.code = code; self.message = message }
}

func boundsJSON(_ bounds: CGRect) -> [String: Double] {
    ["left": bounds.origin.x, "top": bounds.origin.y, "width": bounds.width, "height": bounds.height]
}

func displayLayout() throws -> [String: Any] {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success else {
        throw BridgeError("display_unavailable", "Cannot enumerate active displays.")
    }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &ids, &count) == .success, count > 0 else {
        throw BridgeError("display_unavailable", "No active display is available.")
    }
    let displays: [[String: Any]] = ids.prefix(Int(count)).sorted().map { id in
        let mode = CGDisplayCopyDisplayMode(id)
        return ["id": id, "desktopBounds": boundsJSON(CGDisplayBounds(id)),
         "width": mode?.pixelWidth ?? CGDisplayPixelsWide(id), "height": mode?.pixelHeight ?? CGDisplayPixelsHigh(id),
         "rotation": CGDisplayRotation(id)]
    }
    var result: [String: Any] = ["mainDisplayId": CGMainDisplayID(), "displays": displays]
    let serialized = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    result["version"] = SHA256.hash(data: serialized).map { String(format: "%02x", $0) }.joined()
    return result
}

func requireAccessibility() throws {
    guard AXIsProcessTrusted() else {
        throw BridgeError("accessibility_denied", "Enable Accessibility for the launching app in System Settings > Privacy & Security, then restart it. No permission prompt was opened.")
    }
}

func number(_ request: [String: Any], _ key: String) -> Double? {
    guard let value = request[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { return nil }
    return value.doubleValue
}

func point(_ request: [String: Any]) throws -> CGPoint {
    guard let x = number(request, "x"), let y = number(request, "y"), abs(x) <= 1_000_000, abs(y) <= 1_000_000 else {
        throw BridgeError("invalid_point", "Pointer coordinates must be finite desktop coordinates.")
    }
    return CGPoint(x: x, y: y)
}

@available(macOS 14.0, *)
func captureDisplay(_ id: CGDirectDisplayID) async throws -> [String: Any] {
    guard CGPreflightScreenCaptureAccess() else {
        throw BridgeError("screen_recording_denied", "Enable Screen Recording for the launching app in System Settings > Privacy & Security, then restart it. No permission prompt was opened.")
    }
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first(where: { $0.displayID == id }) else {
        throw BridgeError("display_unavailable", "Requested display is no longer available.")
    }
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.width = Int((filter.contentRect.width * CGFloat(filter.pointPixelScale)).rounded())
    configuration.height = Int((filter.contentRect.height * CGFloat(filter.pointPixelScale)).rounded())
    configuration.showsCursor = false
    let bounds = CGDisplayBounds(id)
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
    guard bounds == CGDisplayBounds(id) else { throw BridgeError("display_changed", "Display geometry changed during capture.") }
    let bytes = NSMutableData()
    guard let encoder = CGImageDestinationCreateWithData(bytes, UTType.png.identifier as CFString, 1, nil) else {
        throw BridgeError("encode_failed", "Cannot create PNG encoder.")
    }
    CGImageDestinationAddImage(encoder, image, nil)
    guard CGImageDestinationFinalize(encoder) else { throw BridgeError("encode_failed", "Cannot encode captured PNG.") }
    return ["png": (bytes as Data).base64EncodedString(), "width": image.width, "height": image.height, "desktopBounds": boundsJSON(bounds)]
}

func postClick(_ point: CGPoint, right: Bool) throws {
    try requireAccessibility()
    guard let down = CGEvent(mouseEventSource: nil, mouseType: right ? .rightMouseDown : .leftMouseDown, mouseCursorPosition: point, mouseButton: right ? .right : .left),
          let up = CGEvent(mouseEventSource: nil, mouseType: right ? .rightMouseUp : .leftMouseUp, mouseCursorPosition: point, mouseButton: right ? .right : .left) else {
        throw BridgeError("event_creation_failed", "Cannot create mouse event.")
    }
    down.setIntegerValueField(.mouseEventClickState, value: 1)
    up.setIntegerValueField(.mouseEventClickState, value: 1)
    down.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.02)
    up.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.02)
}

func postText(_ text: String, source: CGEventSource? = nil, paced: Bool = true, delivery: (CGEvent) throws -> Void = { $0.post(tap: .cghidEventTap) }) throws {
    guard text.utf16.count <= 4096 else { throw BridgeError("invalid_text", "Text may contain at most 4096 UTF-16 code units.") }
    let clusters = text.map { Array(String($0).utf16) }
    guard clusters.allSatisfy({ $0.count <= 20 }) else { throw BridgeError("text_cluster_too_long", "A grapheme cluster exceeds the native event limit of 20 UTF-16 code units.") }
    try requireAccessibility()
    let events = try clusters.map { units -> (CGEvent, CGEvent) in
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
            throw BridgeError("event_creation_failed", "Cannot create text event.")
        }
        units.withUnsafeBufferPointer { buffer in
            down.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)
            up.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)
        }
        down.flags = []; up.flags = []
        return (down, up)
    }
    for (down, up) in events {
        try delivery(down)
        if paced { Thread.sleep(forTimeInterval: 0.01) }
        try delivery(up)
        if paced { Thread.sleep(forTimeInterval: 0.01) }
    }
}

func postKey(_ key: String, source: CGEventSource? = nil, paced: Bool = true, delivery: (CGEvent) throws -> Void = { $0.post(tap: .cghidEventTap) }) throws {
    let keys: [String: Int] = [
        "enter": kVK_Return, "escape": kVK_Escape, "tab": kVK_Tab, "backspace": kVK_Delete,
        "delete": kVK_ForwardDelete, "space": kVK_Space,
        "arrowup": kVK_UpArrow, "arrowdown": kVK_DownArrow, "arrowleft": kVK_LeftArrow, "arrowright": kVK_RightArrow,
        "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D,
        "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G, "h": kVK_ANSI_H,
        "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L,
        "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P,
        "q": kVK_ANSI_Q, "r": kVK_ANSI_R, "s": kVK_ANSI_S, "t": kVK_ANSI_T,
        "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X,
        "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
    ]
    let modifiers: [String: CGEventFlags] = ["meta": .maskCommand, "alt": .maskAlternate, "ctrl": .maskControl, "shift": .maskShift]
    let parts = key.lowercased().components(separatedBy: "+")
    guard let last = parts.last, let virtualKey = keys[last] else { throw BridgeError("invalid_key", "Unsupported key or key combination.") }
    var flags: CGEventFlags = []
    for name in parts.dropLast() {
        guard let flag = modifiers[name], !flags.contains(flag) else { throw BridgeError("invalid_key", "Unsupported or repeated modifier.") }
        flags.insert(flag)
    }
    try requireAccessibility()
    guard let down = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(virtualKey), keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(virtualKey), keyDown: false) else {
        throw BridgeError("event_creation_failed", "Cannot create key event.")
    }
    down.flags = flags; up.flags = []
    try delivery(down)
    if paced { Thread.sleep(forTimeInterval: 0.02) }
    try delivery(up)
    if paced { Thread.sleep(forTimeInterval: 0.02) }
}

func postScroll(_ request: [String: Any]) throws {
    let location = try point(request)
    guard let dx = number(request, "deltaX"), let dy = number(request, "deltaY"),
          let x = Int32(exactly: dx), let y = Int32(exactly: dy), x != Int32.min, y != Int32.min else {
        throw BridgeError("invalid_scroll", "Scroll deltas must be signed 32-bit integers, excluding the minimum value.")
    }
    try requireAccessibility()
    // Quartz applies the user's natural-scroll preference to synthetic wheel events.
    // Keep the public contract positive=down/right regardless of that setting.
    let natural = UserDefaults.standard.object(forKey: "com.apple.swipescrolldirection") as? Bool ?? true
    let direction: Int32 = natural ? 1 : -1
    guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: direction * y, wheel2: direction * x, wheel3: 0) else {
        throw BridgeError("event_creation_failed", "Cannot create scroll event.")
    }
    event.location = location
    event.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.02)
}

@main struct DesktopBridge {
    static func main() async {
        let response: [String: Any]
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard data.count <= 1_048_576, let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let action = request["action"] as? String else { throw BridgeError("invalid_request", "Expected a JSON object with an action string.") }
            var result: [String: Any] = ["status": "executed"]
            switch action {
            case "permissions": result = ["screenRecording": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted()]
            case "apps": result = listApps()
            case "windows": result = ["windows": windowRows().map(windowJSON)]
            case "window_info": result = try resolveWindow(request)
            case "app_state":
                let target = try resolveWindow(request)
                result = ["target":target,"elements":elementRows(try axWindows(target)),"frontmost_pid":listApps()["frontmost_pid"]!]
            case "window_stream": try await streamWindow(request)
            case "window_capture": result = try await captureWindow(request)
            case "target_action": result = try targetAction(request)
            case "layout": result = try displayLayout()
            case "capture":
                guard let value = number(request, "displayId"), let id = UInt32(exactly: value) else { throw BridgeError("invalid_display", "Display ID must be an unsigned 32-bit integer.") }
                if #available(macOS 14.0, *) { result = try await captureDisplay(id) }
                else { throw BridgeError("unsupported_platform", "Screen capture requires macOS 14 or later.") }
            case "click":
                let location = try point(request)
                guard let right = request["right"] as? Bool else { throw BridgeError("invalid_request", "Click requires a boolean right field.") }
                try postClick(location, right: right)
            case "text":
                guard let text = request["text"] as? String else { throw BridgeError("invalid_text", "Text must be a string.") }
                try postText(text)
            case "key":
                guard let key = request["key"] as? String else { throw BridgeError("invalid_key", "Key must be a string.") }
                try postKey(key)
            case "scroll": try postScroll(request)
            default: throw BridgeError("invalid_action", "Unknown desktop action.")
            }
            response = ["ok": true, "result": result]
        } catch let error as BridgeError {
            response = ["ok": false, "error": ["code": error.code, "message": error.message]]
        } catch {
            let nsError = error as NSError
            let code = nsError.domain == NSCocoaErrorDomain ? "invalid_request" : "capture_failed"
            response = ["ok": false, "error": ["code": code, "message": error.localizedDescription]]
        }
        if let output = try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]) {
            FileHandle.standardOutput.write(output)
            FileHandle.standardOutput.write(Data([10]))
        }
    }
}
