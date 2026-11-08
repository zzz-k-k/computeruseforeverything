// Read-only acceptance monitor. Never activates apps or suppresses events.
import AppKit
import ApplicationServices
import Darwin

typealias GetFront = @convention(c) (UnsafeMutablePointer<UInt32>) -> Int16
typealias GetPID = @convention(c) (UnsafePointer<UInt32>, UnsafeMutablePointer<Int32>) -> Int32
typealias GetKey = @convention(c) (UnsafeMutablePointer<UInt32>, UnsafeMutablePointer<DarwinBoolean>) -> Int32
let handle = UnsafeMutableRawPointer(bitPattern: -2)
func required(_ name: String) -> UnsafeMutableRawPointer {
    guard let p = dlsym(handle, name) else { fputs("Missing \(name)\n", stderr); exit(2) }; return p
}
let getFront = unsafeBitCast(required("GetFrontProcess"), to: GetFront.self)
let getPID = unsafeBitCast(required("GetProcessPID"), to: GetPID.self)
let getKey = unsafeBitCast(required("CPSGetKeyFocusProcess"), to: GetKey.self)
func snapshot() -> [String: Int32] {
    var front: [UInt32] = [0,0], key: [UInt32] = [0,0]
    var f: Int32 = 0, k: Int32 = 0
    var flag: DarwinBoolean = false
    let fs = front.withUnsafeMutableBufferPointer { getFront($0.baseAddress!) }
    let ks = key.withUnsafeMutableBufferPointer { getKey($0.baseAddress!, &flag) }
    let fp = front.withUnsafeBufferPointer { getPID($0.baseAddress!, &f) }
    let kp = key.withUnsafeBufferPointer { getPID($0.baseAddress!, &k) }
    return ["frontmost_pid": f, "keyboard_pid": k, "front_status": Int32(fs), "key_status": ks, "front_pid_status": fp, "key_pid_status": kp]
}
func emit(_ object: [String: Any]) { let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]); FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])) }
// Allow the process registry connection to initialize before claiming readiness.
_ = snapshot()
RunLoop.current.run(until: Date().addingTimeInterval(0.2))
let start = ProcessInfo.processInfo.systemUptime
let initial = snapshot()
var previous = initial, count = 0, changes: [[String: Any]] = [], activations: [[String: Any]] = []
var last = start, maxGap: Double = 0
let token = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
    if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
        activations.append(["pid": app.processIdentifier, "at_ms": (ProcessInfo.processInfo.systemUptime-start)*1000])
    }
}
func sample() {
    let now = ProcessInfo.processInfo.systemUptime
    maxGap = max(maxGap, (now-last)*1000); last = now; count += 1
    let current = snapshot()
    if current != previous { changes.append(["state": current, "at_ms": (now-start)*1000]); previous = current }
}
let timer = Timer(timeInterval: 0.005, repeats: true) { _ in sample() }
RunLoop.main.add(timer, forMode: .common)
var finished = false
func finish() {
    guard !finished else { return }; finished = true
    sample(); timer.invalidate(); NSWorkspace.shared.notificationCenter.removeObserver(token)
    emit(["kind":"report", "initial":initial, "final":previous, "samples":count, "changes":changes, "activations":activations, "max_sample_gap_ms":maxGap, "elapsed_ms":(ProcessInfo.processInfo.systemUptime-start)*1000])
    CFRunLoopStop(CFRunLoopGetMain())
}
FileHandle.standardInput.readabilityHandler = { handle in
    _ = handle.availableData
    handle.readabilityHandler = nil
    DispatchQueue.main.async { finish() }
}
DispatchQueue.main.asyncAfter(deadline: .now()+60) { finish() }
emit(["kind":"ready", "initial":initial])
CFRunLoopRun()
