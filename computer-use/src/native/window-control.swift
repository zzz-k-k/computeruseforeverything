import AppKit
import ApplicationServices
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

func listApps() -> [String: Any] {
    let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy != .prohibited }.map { app -> [String: Any] in
        ["pid": app.processIdentifier, "app": app.bundleIdentifier ?? "", "name": app.localizedName ?? "", "active": app.isActive]
    }
    return ["apps": apps, "frontmost_pid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0]
}
func windowRows() -> [[String: Any]] {
    (CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? [])
}
func windowJSON(_ row: [String: Any]) -> [String: Any] {
    let pid = row[kCGWindowOwnerPID as String] as? Int32 ?? 0
    let rect = CGRect(dictionaryRepresentation: row[kCGWindowBounds as String] as! CFDictionary) ?? .zero
    let app = NSRunningApplication(processIdentifier: pid)
    return ["pid": pid, "window_id": row[kCGWindowNumber as String] ?? 0, "app": app?.bundleIdentifier ?? "", "title": row[kCGWindowName as String] ?? "", "bounds": boundsJSON(rect), "on_screen": row[kCGWindowIsOnscreen as String] as? Bool ?? false]
}
func resolveWindow(_ request: [String: Any]) throws -> [String: Any] {
    guard let target = request["target"] as? [String: Any], let wid = number(target,"window_id"), let id = UInt32(exactly: wid),
          let row = windowRows().first(where: { ($0[kCGWindowNumber as String] as? UInt32) == id }) else { throw BridgeError("target_unavailable", "Target window no longer exists.") }
    let result = windowJSON(row)
    guard let pid = result["pid"] as? Int32,
          (target["pid"] as? Int32).map({ $0 == pid }) ?? true,
          (target["app"] as? String).map({ $0 == result["app"] as? String }) ?? true else { throw BridgeError("target_mismatch", "Window does not belong to the requested application.") }
    return result
}
func axValue(_ el: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?; guard AXUIElementCopyAttributeValue(el, key as CFString, &value) == .success else { return nil }; return value
}
func axWindows(_ target: [String: Any]) throws -> AXUIElement {
    try requireAccessibility()
    let root = AXUIElementCreateApplication(target["pid"] as! Int32)
    AXUIElementSetMessagingTimeout(root, 2)
    let windows = axValue(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
    let b = target["bounds"] as! [String: Double]
    // Public AX exposes window geometry rather than CGWindowID. Require one exact geometry match.
    let matches = windows.filter { w in
        guard let pos = axValue(w,kAXPositionAttribute), CFGetTypeID(pos) == AXValueGetTypeID(), let size = axValue(w,kAXSizeAttribute), CFGetTypeID(size) == AXValueGetTypeID() else { return false }
        var pt = CGPoint.zero; var sz = CGSize.zero
        AXValueGetValue(pos as! AXValue, .cgPoint, &pt); AXValueGetValue(size as! AXValue, .cgSize, &sz)
        return abs(pt.x-b["left"]!)<2 && abs(pt.y-b["top"]!)<2 && abs(sz.width-b["width"]!)<2 && abs(sz.height-b["height"]!)<2
    }
    guard matches.count == 1 else { throw BridgeError("ax_window_unavailable", "Cannot uniquely match the target AX window.") }
    return matches[0]
}
func elementToken(_ element: AXUIElement, _ path: [Int]) -> String {
    let key = "\(path):\(axValue(element,kAXRoleAttribute) as? String ?? ""):\(axValue(element,kAXTitleAttribute) as? String ?? ""):\(axValue(element,kAXIdentifierAttribute) as? String ?? "")"
    return SHA256.hash(data: Data(key.utf8)).map { String(format:"%02x",$0) }.joined()
}
func elementRows(_ root: AXUIElement) -> [[String: Any]] {
    var result = [[String: Any]]()
    func visit(_ el: AXUIElement, _ path: [Int]) {
        guard result.count < 300, path.count < 12 else { return }
        var actions: CFArray?; AXUIElementCopyActionNames(el,&actions)
        var writable: DarwinBoolean = false; AXUIElementIsAttributeSettable(el,kAXValueAttribute as CFString,&writable)
        var row: [String:Any] = ["path":path,"token":elementToken(el,path),"role":axValue(el,kAXRoleAttribute) as? String ?? "", "title":axValue(el,kAXTitleAttribute) as? String ?? "", "actions": actions as? [String] ?? [], "value_settable":writable.boolValue]
        if let value = axValue(el,kAXValueAttribute) as? String { row["value"] = String(value.prefix(4096)) }
        result.append(row)
        for (i,child) in (axValue(el,kAXChildrenAttribute) as? [AXUIElement] ?? []).enumerated() { visit(child,path+[i]) }
    }
    visit(root,[]); return result
}
func resolveElement(_ root: AXUIElement, _ request: [String:Any]) throws -> AXUIElement {
    guard let path = request["element_path"] as? [Int], path.count < 12, let token = request["element_token"] as? String else { throw BridgeError("invalid_element", "Supply the path and token returned by get_app_state.") }
    var element = root
    for index in path {
        let children = axValue(element,kAXChildrenAttribute) as? [AXUIElement] ?? []
        guard index >= 0, index < children.count else { throw BridgeError("stale_element", "Read app state again.") }; element = children[index]
    }
    guard token == elementToken(element,path) else { throw BridgeError("stale_element", "Element identity changed; read app state again.") }
    return element
}
@available(macOS 14.0, *)
func windowFilter(_ target: [String:Any]) async throws -> SCContentFilter {
    guard CGPreflightScreenCaptureAccess() else { throw BridgeError("screen_recording_denied", "Screen Recording permission is required.") }
    let content = try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:false)
    guard let window = content.windows.first(where: { $0.windowID == target["window_id"] as? UInt32 && $0.owningApplication?.processID == target["pid"] as? Int32 }) else { throw BridgeError("target_unavailable", "Window is not available for capture.") }
    return SCContentFilter(desktopIndependentWindow: window)
}
@available(macOS 14.0, *)
func captureWindow(_ request:[String:Any]) async throws -> [String:Any] {
    let target = try resolveWindow(request); let filter = try await windowFilter(target)
    let config = SCStreamConfiguration(); config.showsCursor=false
    config.width=Int(filter.contentRect.width*CGFloat(filter.pointPixelScale)); config.height=Int(filter.contentRect.height*CGFloat(filter.pointPixelScale))
    let image = try await SCScreenshotManager.captureImage(contentFilter:filter,configuration:config)
    let after = try resolveWindow(request)
    guard NSDictionary(dictionary:target["bounds"] as! [String:Double]).isEqual(to:after["bounds"] as! [String:Double]) else { throw BridgeError("stale_frame", "Window moved during capture.") }
    let bytes=NSMutableData()
    guard let encoder=CGImageDestinationCreateWithData(bytes,UTType.png.identifier as CFString,1,nil) else { throw BridgeError("encode_failed","PNG encoding failed.") }
    CGImageDestinationAddImage(encoder,image,nil)
    guard CGImageDestinationFinalize(encoder) else { throw BridgeError("encode_failed","PNG encoding failed.") }
    return ["png":(bytes as Data).base64EncodedString(),"width":image.width,"height":image.height,"desktopBounds":target["bounds"]!,"target":target]
}
func targetAction(_ request:[String:Any]) throws -> [String:Any] {
    let target = try resolveWindow(request); try requireAccessibility()
    if let bounds=request["expected_bounds"] as? [String:Double], !NSDictionary(dictionary:bounds).isEqual(to:target["bounds"] as! [String:Double]) { throw BridgeError("stale_frame","Window geometry changed before dispatch.") }
    let pid = target["pid"] as! Int32; let before = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    let cursor = CGEvent(source:nil)?.location ?? .zero
    let operation = request["operation"] as? String ?? ""
    let mode = request["mode"] as? String ?? "background"
    let isElement = request["element_path"] != nil
    var element: AXUIElement? = nil
    if isElement { element = try resolveElement(try axWindows(target),request) }
    if !isElement && mode != "foreground" { return try performBackgroundInput(request,target:target) }
    if mode == "foreground" {
        let window = try axWindows(target)
        guard AXUIElementPerformAction(window,kAXRaiseAction as CFString) == .success else { throw BridgeError("activation_failed","Cannot raise target window.") }
        guard NSRunningApplication(processIdentifier:pid)?.activate(options:[]) == true else { throw BridgeError("activation_failed","Cannot activate target.") }
        Thread.sleep(forTimeInterval:0.1)
        guard try liveForegroundPID() == pid else { throw BridgeError("activation_failed","Target did not become frontmost.") }
    }
    if !isElement {
        if operation == "type" || operation == "press_key" {
            let app=AXUIElementCreateApplication(pid)
            guard let focused=axValue(app,kAXFocusedWindowAttribute), CFEqual(focused,try axWindows(target)) else { throw BridgeError("target_not_focused","Requested window does not have keyboard focus.") }
        }
        let current = try resolveWindow(request)
        if let bounds=request["expected_bounds"] as? [String:Double], !NSDictionary(dictionary:bounds).isEqual(to:current["bounds"] as! [String:Double]) { throw BridgeError("stale_frame","Window moved during activation; take a new screenshot.") }
        switch operation {
        case "click": try postClick(try point(request),right:request["right"] as? Bool ?? false)
        case "type": try postText(request["text"] as? String ?? "")
        case "press_key": try postKey(request["key"] as? String ?? "")
        case "scroll": try postScroll(request)
        default: throw BridgeError("action_unsupported","Unsupported directed event.")
        }
        return ["status":"dispatched","backend":"foreground_events","execution_mode":mode,"focus_changed":before != NSWorkspace.shared.frontmostApplication?.processIdentifier,"cursor_moved":cursor != CGEvent(source:nil)?.location,"cursor_before":["x":cursor.x,"y":cursor.y],"cursor_after":["x":CGEvent(source:nil)?.location.x ?? 0,"y":CGEvent(source:nil)?.location.y ?? 0],"verification":["status":"unknown"],"target":target]
    }
    let selected = element!
    var verified = false
    if operation == "set_value" {
        guard let text=request["text"] as? String else { throw BridgeError("invalid_text","Text required.") }
        var writable:DarwinBoolean=false
        AXUIElementIsAttributeSettable(selected,kAXValueAttribute as CFString,&writable)
        guard writable.boolValue else { throw BridgeError("action_unsupported","Element value is not writable.") }
        guard AXUIElementSetAttributeValue(selected,kAXValueAttribute as CFString,text as CFString) == .success else { throw BridgeError("action_failed","AX value update failed.") }
        verified = (axValue(selected,kAXValueAttribute) as? String) == text
    } else if operation == "click" {
        var actions:CFArray?; AXUIElementCopyActionNames(selected,&actions)
        guard (actions as? [String] ?? []).contains(kAXPressAction) else { throw BridgeError("action_unsupported","Element does not support AXPress.") }
        guard AXUIElementPerformAction(selected,kAXPressAction as CFString) == .success else { throw BridgeError("action_failed","AXPress failed.") }
    } else { throw BridgeError("background_unsupported","This background action requires an AX element operation.") }
    let after=NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    return ["status":"dispatched","backend":"ax","execution_mode":mode,"focus_changed":before != after,"cursor_moved":cursor != CGEvent(source:nil)?.location,"cursor_before":["x":cursor.x,"y":cursor.y],"cursor_after":["x":CGEvent(source:nil)?.location.x ?? 0,"y":CGEvent(source:nil)?.location.y ?? 0],"verification":["status":verified ? "verified":"unknown"],"target":target]
}

final class WindowStreamOutput: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let started = ProcessInfo.processInfo.systemUptime
    var suspended = true
    var ready = false
    var hasFrame = false
    let queue = DispatchQueue(label:"window.output")
    func stream(_ stream: SCStream, didStopWithError error: Error) { emit(["error": ["code":"capture_stopped", "message":error.localizedDescription]]); exit(1) }
    func emit(_ value:[String:Any]) {
        if let data=try? JSONSerialization.data(withJSONObject:value) { FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])) }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard ready else { return }
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary:false) as? [[SCStreamFrameInfo:Any]],
              let status = attachments.first?[.status] as? Int else { return }
        suspended = status == SCFrameStatus.suspended.rawValue || status == SCFrameStatus.blank.rawValue || (!hasFrame && status == SCFrameStatus.idle.rawValue)
        guard status == SCFrameStatus.complete.rawValue || status == SCFrameStatus.started.rawValue,
              let pixel = sampleBuffer.imageBuffer else { return }
        CVPixelBufferLockBaseAddress(pixel,.readOnly); defer { CVPixelBufferUnlockBaseAddress(pixel,.readOnly) }
        let w=CVPixelBufferGetWidth(pixel), h=CVPixelBufferGetHeight(pixel), stride=CVPixelBufferGetBytesPerRow(pixel)
        guard let base=CVPixelBufferGetBaseAddress(pixel)?.assumingMemoryBound(to:UInt8.self) else { return }
        var rgb=Data(count:w*h*3)
        rgb.withUnsafeMutableBytes { raw in
            let out=raw.bindMemory(to:UInt8.self)
            for y in 0..<h { for x in 0..<w { let i=y*stride+x*4, j=(y*w+x)*3; out[j]=base[i+2]; out[j+1]=base[i+1]; out[j+2]=base[i] } }
        }
        hasFrame = true
        emit(["frame":true,"width":w,"height":h,"t":ProcessInfo.processInfo.systemUptime-started,"rgb":rgb.base64EncodedString(),"capture_backend":"stream"])
    }
}
@available(macOS 14.0, *)
func streamWindow(_ request:[String:Any]) async throws {
    let target=try resolveWindow(request), filter=try await windowFilter(target)
    let config=SCStreamConfiguration(); config.showsCursor=false; config.pixelFormat=kCVPixelFormatType_32BGRA
    config.width=request["width"] as? Int ?? 798; config.height=max(2,Int(CGFloat(config.width)*filter.contentRect.height/filter.contentRect.width)/2*2)
    guard config.height<=2400 else { throw BridgeError("capture_dimensions_unsupported","Window aspect ratio is too tall.") }
    config.minimumFrameInterval=CMTime(value:1,timescale:6); config.queueDepth=3
    let output=WindowStreamOutput(), stream=SCStream(filter:filter,configuration:config,delegate:output)
    try stream.addStreamOutput(output,type:.screen,sampleHandlerQueue:output.queue)
    try await stream.startCapture()
    output.queue.sync { output.emit(["ready":true,"target":target,"width":config.width,"height":config.height]); output.ready=true }
    while true {
        try await Task.sleep(nanoseconds:500_000_000)
        if output.queue.sync(execute: { output.suspended }) {
            let image = try await SCScreenshotManager.captureImage(contentFilter:filter,configuration:config)
            let w=config.width,h=config.height
            var pixels=[UInt8](repeating:0,count:w*h*4)
            pixels.withUnsafeMutableBytes { raw in
                if let context=CGContext(data:raw.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) { context.draw(image,in:CGRect(x:0,y:0,width:w,height:h)) }
            }
            var rgb=Data(count:w*h*3)
            rgb.withUnsafeMutableBytes { raw in let p=raw.bindMemory(to:UInt8.self); for i in 0..<w*h { p[i*3]=pixels[i*4];p[i*3+1]=pixels[i*4+1];p[i*3+2]=pixels[i*4+2] } }
            output.queue.sync { output.emit(["frame":true,"width":w,"height":h,"t":ProcessInfo.processInfo.systemUptime-output.started,"rgb":rgb.base64EncodedString(),"capture_backend":"snapshot_fallback"]) }
        }
        do {
            let current = try resolveWindow(request)
            let oldBounds=target["bounds"] as! [String:Double], newBounds=current["bounds"] as! [String:Double]
            if oldBounds["width"] != newBounds["width"] || oldBounds["height"] != newBounds["height"] { throw BridgeError("capture_dimensions_changed","Window resized; restart capture.") }
        } catch { try await stream.stopCapture(); throw error }
    }
}
