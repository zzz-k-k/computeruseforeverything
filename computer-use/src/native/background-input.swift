import AppKit
import ApplicationServices
import Darwin

// Query the WindowServer process registry each time. NSWorkspace can cache
// frontmostApplication while this short-lived bridge blocks its run loop.
func liveForegroundPID() throws -> pid_t {
    typealias GetFront = @convention(c) (UnsafeMutablePointer<UInt32>) -> Int16
    typealias GetPID = @convention(c) (UnsafePointer<UInt32>, UnsafeMutablePointer<Int32>) -> Int32
    let handle=UnsafeMutableRawPointer(bitPattern:-2)
    guard let front=dlsym(handle,"GetFrontProcess"), let get=dlsym(handle,"GetProcessPID") else { throw BridgeError("focus_guard_unavailable","Live foreground query is unavailable.") }
    var psn:[UInt32]=[0,0]; var pid:Int32=0
    let status=psn.withUnsafeMutableBufferPointer { unsafeBitCast(front,to:GetFront.self)($0.baseAddress!) }
    let result=psn.withUnsafeBufferPointer { unsafeBitCast(get,to:GetPID.self)($0.baseAddress!,&pid) }
    guard status == 0 && result == 0 && pid>0 else { throw BridgeError("focus_guard_unavailable","Live foreground query failed.") }
    return pid
}

// Reimplemented from observed event semantics, not linked against Codex binaries.
// Private event fields/types are isolated here and validated by fixture acceptance.
final class BackgroundInput {
    let pid: pid_t
    let windowID: Int
    let bounds: CGRect
    let foreground: pid_t
    let cursor: CGPoint
    var synthetic = false
    var heldKeys: [Int64:CGEvent] = [:]
    init(_ target:[String:Any]) throws {
        pid=target["pid"] as! Int32; windowID=(target["window_id"] as! NSNumber).intValue
        let b=target["bounds"] as! [String:Double]
        bounds=CGRect(x:b["left"]!,y:b["top"]!,width:b["width"]!,height:b["height"]!)
        foreground=try liveForegroundPID()
        cursor=CGEvent(source:nil)?.location ?? .zero
        guard foreground != 0 else { throw BridgeError("focus_guard_unavailable","Cannot determine foreground application.") }
    }
    func check() throws {
        guard try liveForegroundPID() == foreground else {
            throw BridgeError("focus_changed","Foreground changed during input; input may be partially delivered. Observe before retrying.")
        }
        guard NSRunningApplication(processIdentifier:pid)?.isTerminated == false else { throw BridgeError("target_unavailable","Target process exited.") }
    }
    func notify(type: NSEvent.EventType, subtype: Int16, window: Int=0, flags:NSEvent.ModifierFlags=[]) throws {
        guard let event=NSEvent.otherEvent(with:type,location:.zero,modifierFlags:flags,timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:window,context:nil,subtype:subtype,data1:0,data2:0)?.cgEvent else { throw BridgeError("event_creation_failed","Cannot create focus notification.") }
        event.postToPid(pid)
    }
    func begin() throws {
        try check()
        if foreground != pid {
            try notify(type:.appKitDefined,subtype:1,window:windowID,flags:NSEvent.ModifierFlags(rawValue:0xc0000))
            synthetic=true

            // Codex's notifyWindowKeyFocusReturned: event type 21, subtype 0x8000.
            try notify(type:NSEvent.EventType(rawValue:21)!,subtype:Int16(bitPattern:0x8000))
            Thread.sleep(forTimeInterval:0.04)
            try check()
        }
    }
    func end() {
        // Release only keys sent by this operation, always to the same PID.
        for up in heldKeys.values { up.timestamp=CGEventTimestamp(ProcessInfo.processInfo.systemUptime*1_000_000_000); up.postToPid(pid) }
        heldKeys.removeAll()
        guard synthetic else { return }
        // Never deactivate an app the user has actually brought forward meanwhile.
        if let current=try? liveForegroundPID(), current != pid {
            try? notify(type:NSEvent.EventType(rawValue:21)!,subtype:0x4000)
            try? notify(type:.appKitDefined,subtype:2)
        }
        synthetic=false
    }
    func send(_ input:CGEvent) throws {
        try check()
        let event=input
        if event.type == .leftMouseDown || event.type == .rightMouseDown || event.type == .leftMouseUp || event.type == .rightMouseUp {
            event.setIntegerValueField(CGEventField(rawValue:91)!,value:Int64(windowID))
            event.setIntegerValueField(CGEventField(rawValue:92)!,value:Int64(windowID))
        }
        event.timestamp=CGEventTimestamp(ProcessInfo.processInfo.systemUptime*1_000_000_000)
        event.postToPid(pid)
        if event.type == .keyDown, let up=event.copy() {
            up.type = .keyUp; up.flags=[]
            heldKeys[event.getIntegerValueField(.keyboardEventKeycode)]=up
        } else if event.type == .keyUp { heldKeys.removeValue(forKey:event.getIntegerValueField(.keyboardEventKeycode)) }
    }
    func click(_ location:CGPoint,right:Bool) throws {
        let local=CGPoint(x:location.x-bounds.minX,y:bounds.maxY-location.y)
        let downType:NSEvent.EventType=right ? .rightMouseDown:.leftMouseDown
        let upType:NSEvent.EventType=right ? .rightMouseUp:.leftMouseUp
        let down=try mouse(downType,local:local,global:location,right:right)
        let up=try mouse(upType,local:local,global:location,right:right)
        try send(down)
        // Balance a delivered press even if the foreground changes between events.
        defer { up.timestamp=CGEventTimestamp(ProcessInfo.processInfo.systemUptime*1_000_000_000); up.postToPid(pid) }
        Thread.sleep(forTimeInterval:0.02)
        try check()
    }
    func mouse(_ type:NSEvent.EventType,local:CGPoint,global:CGPoint,right:Bool) throws -> CGEvent {
        guard let event=NSEvent.mouseEvent(with:type,location:local,modifierFlags:[],timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:windowID,context:nil,eventNumber:1,clickCount:1,pressure:1)?.cgEvent else { throw BridgeError("event_creation_failed","Cannot create window mouse event.") }
        // NSEvent carries local coordinates; CG global location needs a separate window-local setter.
        event.location=global
        event.setIntegerValueField(.mouseEventButtonNumber,value:right ? 1:0)
        event.setIntegerValueField(CGEventField(rawValue:7)!,value:3)
        event.setIntegerValueField(CGEventField(rawValue:91)!,value:Int64(windowID))
        event.setIntegerValueField(CGEventField(rawValue:92)!,value:Int64(windowID))
        typealias SetLocation = @convention(c) (CGEvent, CGPoint) -> Void
        guard let address=dlsym(UnsafeMutableRawPointer(bitPattern:-2),"CGEventSetWindowLocation") else { throw BridgeError("background_unsupported","Window-local event API is unavailable on this OS.") }
        unsafeBitCast(address,to:SetLocation.self)(event,CGPoint(x:global.x-bounds.minX,y:global.y-bounds.minY))
        return event
    }
}

func performBackgroundInput(_ request:[String:Any],target:[String:Any]) throws -> [String:Any] {
    let operation=request["operation"] as? String ?? ""
    // Validate and build every input before any synthetic activation.
    var keys:[CGEvent]=[]
    let source=CGEventSource(stateID:.combinedSessionState)
    switch operation {
    case "click": _ = try point(request)
    case "type": try postText(request["text"] as? String ?? "",source:source,paced:false,delivery:{keys.append($0)})
    case "press_key": try postKey(request["key"] as? String ?? "",source:source,paced:false,delivery:{keys.append($0)})
    default: throw BridgeError("background_unsupported","This operation is not available as background events.")
    }
    guard keys.count <= 1024 else { throw BridgeError("invalid_text","Background text is limited to 512 grapheme clusters per call.") }
    let guardState=try BackgroundInput(target)
    if operation == "click", !guardState.bounds.contains(try point(request)) { throw BridgeError("coordinate_out_of_bounds","Point is outside target window.") }
    let axWindow = try axWindows(target)
    guard (axValue(axWindow,kAXMinimizedAttribute) as? Bool) != true,
          NSRunningApplication(processIdentifier:guardState.pid)?.isHidden == false else {
        throw BridgeError("background_unsupported","Unhide or restore the target window before background input.")
    }
    var activationPoint:CGPoint? = nil
    var activationStrategy="notifications_only"
    // Codex notifyAppActivated accepts an optional activationPoint. A title
    // element is one source of a point, not a prerequisite for synthetic focus.
    if guardState.foreground != guardState.pid {
        if let raw=axValue(axWindow,"AXActivationPoint"), CFGetTypeID(raw)==AXValueGetTypeID(), AXValueGetType(raw as! AXValue) == .cgPoint {
            var p=CGPoint.zero
            if AXValueGetValue(raw as! AXValue,.cgPoint,&p), p.x.isFinite, p.y.isFinite, guardState.bounds.contains(p) { activationPoint=p; activationStrategy="ax_activation_point" }
        }
        if activationPoint == nil, let titleValue=axValue(axWindow,kAXTitleUIElementAttribute), CFGetTypeID(titleValue)==AXUIElementGetTypeID() {
            let title=titleValue as! AXUIElement
            if let pos=axValue(title,kAXPositionAttribute), let size=axValue(title,kAXSizeAttribute), CFGetTypeID(pos)==AXValueGetTypeID(), CFGetTypeID(size)==AXValueGetTypeID() {
                var p=CGPoint.zero; var s=CGSize.zero
                if AXValueGetValue(pos as! AXValue,.cgPoint,&p), AXValueGetValue(size as! AXValue,.cgSize,&s), s.width>0, s.height>0 {
                    let center=CGPoint(x:p.x+s.width/2,y:p.y+s.height/2)
                    if center.x.isFinite, center.y.isFinite, guardState.bounds.contains(center) { activationPoint=center; activationStrategy="title_element" }
                }
            }
        }
    }
    guard (operation != "click" && activationPoint == nil) || dlsym(UnsafeMutableRawPointer(bitPattern:-2),"CGEventSetWindowLocation") != nil else { throw BridgeError("background_unsupported","Window-local event API unavailable.") }
    defer { guardState.end() }
    try guardState.begin()
    if let location=activationPoint {
        try guardState.click(location,right:false)
        Thread.sleep(forTimeInterval:0.04)
    }
    try guardState.notify(type:NSEvent.EventType(rawValue:21)!,subtype:Int16(bitPattern:0x8000))
    Thread.sleep(forTimeInterval:0.03)
    try guardState.check()
    let current=try resolveWindow(["target":target])
    guard NSDictionary(dictionary:target["bounds"] as! [String:Double]).isEqual(to:current["bounds"] as! [String:Double]) else { throw BridgeError("stale_frame","Window moved while preparing input.") }
    if operation == "click" { try guardState.click(try point(request),right:request["right"] as? Bool ?? false) }
    else {
        let app=AXUIElementCreateApplication(guardState.pid)
        guard let focused=axValue(app,kAXFocusedWindowAttribute), CFEqual(focused,axWindow) else { throw BridgeError("target_not_focused","Requested window did not acquire internal keyboard focus.") }
        for event in keys { try guardState.send(event); Thread.sleep(forTimeInterval:0.01) }
    }
    Thread.sleep(forTimeInterval:0.04)
    try guardState.check()
    return ["status":"dispatched","backend":"window_events","execution_mode":"background","focus_changed":false,"cursor_moved":guardState.cursor != CGEvent(source:nil)?.location,"focus_protection":"abort_on_foreground_change","activation_strategy":activationStrategy,"verification":["status":"unknown"],"target":target]
}
