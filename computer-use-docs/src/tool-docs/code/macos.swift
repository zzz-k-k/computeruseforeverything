import ApplicationServices
import Carbon
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

enum DesktopError: Error {
    case permissionDenied, displayUnavailable, encodeFailed
    case eventCreationFailed, invalidKey, textClusterTooLong, invalidScroll
}

// snippet: screenshot
struct CapturedFrame {
    let displayID: CGDirectDisplayID
    let desktopBounds: CGRect
    let width: Int
    let height: Int
    let png: Data
}

@available(macOS 14.0, *)
func captureDisplay(_ displayID: CGDirectDisplayID) async throws -> CapturedFrame {
    guard CGPreflightScreenCaptureAccess() else {
        throw DesktopError.permissionDenied
    }
    let content = try await SCShareableContent.excludingDesktopWindows(
        false, onScreenWindowsOnly: true
    )
    guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
        throw DesktopError.displayUnavailable
    }

    let filter = SCContentFilter(display: display, excludingWindows: [])
    let config = SCStreamConfiguration()
    let scale = CGFloat(filter.pointPixelScale)
    config.width = Int((filter.contentRect.width * scale).rounded())
    config.height = Int((filter.contentRect.height * scale).rounded())
    config.showsCursor = false

    let bounds = CGDisplayBounds(displayID)
    let image = try await SCScreenshotManager.captureImage(
        contentFilter: filter, configuration: config
    )
    guard bounds == CGDisplayBounds(displayID) else {
        throw DesktopError.displayUnavailable
    }
    let bytes = NSMutableData()
    guard let png = CGImageDestinationCreateWithData(
        bytes, UTType.png.identifier as CFString, 1, nil
    ) else { throw DesktopError.encodeFailed }
    CGImageDestinationAddImage(png, image, nil)
    guard CGImageDestinationFinalize(png) else { throw DesktopError.encodeFailed }

    return CapturedFrame(displayID: displayID, desktopBounds: bounds,
                         width: image.width, height: image.height, png: bytes as Data)
}
// end-snippet

// snippet: click
func postClick(at point: CGPoint, right: Bool) throws {
    guard AXIsProcessTrusted() else { throw DesktopError.permissionDenied }
    let button: CGMouseButton = right ? .right : .left
    let downType: CGEventType = right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = right ? .rightMouseUp : .leftMouseUp
    guard let down = CGEvent(mouseEventSource: nil, mouseType: downType,
                             mouseCursorPosition: point, mouseButton: button),
          let up = CGEvent(mouseEventSource: nil, mouseType: upType,
                           mouseCursorPosition: point, mouseButton: button) else {
        throw DesktopError.eventCreationFailed
    }
    down.setIntegerValueField(.mouseEventClickState, value: 1)
    up.setIntegerValueField(.mouseEventClickState, value: 1)
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}
// end-snippet

// snippet: type
func postText(_ text: String) throws {
    guard AXIsProcessTrusted() else { throw DesktopError.permissionDenied }
    let units = text.map { Array(String($0).utf16) }
    guard units.allSatisfy({ $0.count <= 20 }) else {
        throw DesktopError.textClusterTooLong
    }
    let events = try units.map { characters -> (CGEvent, CGEvent) in
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            throw DesktopError.eventCreationFailed
        }
        characters.withUnsafeBufferPointer { buffer in
            down.keyboardSetUnicodeString(stringLength: buffer.count,
                                          unicodeString: buffer.baseAddress)
        }
        return (down, up)
    }
    for (down, up) in events {
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }
}
// end-snippet

// snippet: press_key
func postKey(_ key: String) throws {
    guard AXIsProcessTrusted() else { throw DesktopError.permissionDenied }
    let keys: [String: Int] = [
        "enter": kVK_Return, "escape": kVK_Escape, "tab": kVK_Tab,
        "backspace": kVK_Delete, "delete": kVK_ForwardDelete, "space": kVK_Space,
        "arrowup": kVK_UpArrow, "arrowdown": kVK_DownArrow,
        "arrowleft": kVK_LeftArrow, "arrowright": kVK_RightArrow,
        "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D,
        "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G, "h": kVK_ANSI_H,
        "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L,
        "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P,
        "q": kVK_ANSI_Q, "r": kVK_ANSI_R, "s": kVK_ANSI_S, "t": kVK_ANSI_T,
        "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X,
        "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
    ]
    let modifiers: [String: CGEventFlags] = [
        "meta": .maskCommand, "alt": .maskAlternate,
        "ctrl": .maskControl, "shift": .maskShift,
    ]
    let parts = key.lowercased().components(separatedBy: "+")
    guard let last = parts.last, let virtualKey = keys[last] else {
        throw DesktopError.invalidKey
    }
    var flags: CGEventFlags = []
    for name in parts.dropLast() {
        guard let flag = modifiers[name], !flags.contains(flag) else {
            throw DesktopError.invalidKey
        }
        flags.insert(flag)
    }
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(virtualKey),
                             keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(virtualKey),
                           keyDown: false) else { throw DesktopError.eventCreationFailed }
    down.flags = flags
    up.flags = []
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}
// end-snippet

// snippet: scroll
func postScroll(at point: CGPoint, deltaX: Int, deltaY: Int) throws {
    guard AXIsProcessTrusted() else { throw DesktopError.permissionDenied }
    guard let x = Int32(exactly: deltaX), let y = Int32(exactly: deltaY),
          x != Int32.min, y != Int32.min else { throw DesktopError.invalidScroll }
    guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel,
                              wheelCount: 2, wheel1: -y, wheel2: -x, wheel3: 0) else {
        throw DesktopError.eventCreationFailed
    }
    event.location = point
    event.post(tap: .cghidEventTap)
}
// end-snippet
