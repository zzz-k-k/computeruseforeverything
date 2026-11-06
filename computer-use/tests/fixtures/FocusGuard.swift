import AppKit
let expected=CommandLine.arguments.count>1 ? Int32(CommandLine.arguments[1]) : nil
if let expected=expected,NSWorkspace.shared.frontmostApplication?.processIdentifier == expected {exit(0)}
fputs("Dedicated fixture is not the frontmost application; no test input sent.\n",stderr)
exit(1)
