import AppKit
import Darwin
import Foundation

// The build script supplies the Developer ID requirement used to verify the release.
let files = FileManager.default
let destination = URL(fileURLWithPath: "/Applications/ggmail.app")

struct InstallError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

func run(_ command: String, _ args: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: command)
    process.arguments = args
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw InstallError("\(command) failed") }
}

func installedProcesses() -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { $0.bundleURL?.standardizedFileURL.path == destination.path }
}

func quitInstalled() throws {
    for app in installedProcesses() { _ = app.terminate() }
    let deadline = Date().addingTimeInterval(30)
    while !installedProcesses().isEmpty && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    }
    guard installedProcesses().isEmpty else { throw InstallError("ggmail is still running.") }
}

func exchange(_ staged: URL) throws {
    guard renamex_np(staged.path, destination.path, UInt32(RENAME_SWAP)) == 0 else {
        throw InstallError(String(cString: strerror(errno)))
    }
}

func install() throws {
    guard CommandLine.arguments.count == 3 else { throw InstallError("Run bun run install:mac:local") }
    let stage = destination.deletingLastPathComponent().appendingPathComponent(".ggmail-\(UUID())")
    try files.createDirectory(at: stage, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    let staged = stage.appendingPathComponent("ggmail.app")
    var keepBackup = false
    defer { if !keepBackup { try? files.removeItem(at: stage) } }
    try run("/usr/bin/ditto", [CommandLine.arguments[1], staged.path])
    try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "-R=" + CommandLine.arguments[2], staged.path])

    let replacing = files.fileExists(atPath: destination.path)
    if replacing {
        guard Bundle(url: destination)?.bundleIdentifier == "com.github.salexandr0s.ggmail" else {
            throw InstallError("The installed application has a different bundle identifier.")
        }
        try quitInstalled()
        try exchange(staged)
        keepBackup = true
    } else {
        try files.moveItem(at: staged, to: destination)
    }

    do {
        try run("/usr/bin/open", ["-a", destination.path])
        let deadline = Date().addingTimeInterval(15)
        while !installedProcesses().contains(where: { $0.isFinishedLaunching }) && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        }
        guard installedProcesses().contains(where: { $0.isFinishedLaunching }) else {
            throw InstallError("The updated ggmail did not finish launching.")
        }
        keepBackup = false
    } catch {
        if replacing {
            try quitInstalled()
            try exchange(staged)
            keepBackup = false
            try run("/usr/bin/open", ["-a", destination.path])
        }
        throw error
    }
}

do { try install() } catch {
    FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
    exit(1)
}
