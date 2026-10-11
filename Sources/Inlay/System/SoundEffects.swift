import AppKit
import InlayCore

/// Short cues for a take. A file named after the cue (start.wav, error.aiff, ...)
/// in the client data directory's Sounds folder replaces the built-in sound.
enum DictationSound: String, CaseIterable {
    case start, stop, success, alert, error

    /// macOS system sound used without a custom file. Success stays silent by
    /// default so ordinary takes do not chime.
    fileprivate var systemName: NSSound.Name? {
        switch self {
        case .start: "Tink"
        case .stop: "Pop"
        case .success: nil
        case .alert: "Funk"
        case .error: "Basso"
        }
    }
}

@MainActor
final class SoundEffects {
    static let fileExtensions = ["wav", "aiff", "aif", "caf", "m4a", "mp3"]

    let directory: URL
    private var players: [DictationSound: NSSound] = [:]

    init(directory: URL = SoundEffects.defaultDirectory) {
        self.directory = directory
    }

    nonisolated static var defaultDirectory: URL {
        let root = ProcessInfo.processInfo.environment["INLAY_CLIENT_DATA_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) }
            ?? InlayBuild.current.dataDirectory
        return root.appendingPathComponent("Sounds", isDirectory: true)
    }

    /// Plays a cue and returns its duration, or zero when nothing plays.
    @discardableResult
    func play(_ sound: DictationSound) -> TimeInterval {
        guard let player = player(for: sound) else { return 0 }
        player.stop()
        return player.play() ? player.duration : 0
    }

    private func player(for sound: DictationSound) -> NSSound? {
        if let cached = players[sound] { return cached }
        let custom = Self.fileExtensions.lazy
            .map { self.directory.appendingPathComponent(sound.rawValue).appendingPathExtension($0) }
            .first { FileManager.default.isReadableFile(atPath: $0.path) }
            .flatMap { NSSound(contentsOf: $0, byReference: true) }
        // System sounds are shared instances; copy so stopping one cue never
        // cuts off the same sound elsewhere.
        let player = custom ?? sound.systemName.flatMap { NSSound(named: $0)?.copy() as? NSSound }
        players[sound] = player
        return player
    }
}
