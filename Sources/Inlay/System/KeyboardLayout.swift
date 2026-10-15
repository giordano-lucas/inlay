import Carbon.HIToolbox
import CoreGraphics

/// Keyboard events carry key positions, not characters: virtual key 9 is V
/// only on QWERTY-like layouts (it is "." on Dvorak). Shortcuts are matched
/// by the character the active layout produces with Command held.
enum KeyboardLayout {
    @MainActor
    static func keyCode(producing character: Character) -> CGKeyCode? {
        guard let data = layoutData() else { return nil }
        return data.withUnsafeBytes { bytes -> CGKeyCode? in
            guard let layout = bytes.baseAddress?.assumingMemoryBound(to: UCKeyboardLayout.self) else { return nil }
            let target = String(character).lowercased()
            for code in 0..<CGKeyCode(128) where translate(code, in: layout)?.lowercased() == target {
                return code
            }
            return nil
        }
    }

    @MainActor
    private static func layoutData() -> Data? {
        for copy in [TISCopyCurrentKeyboardLayoutInputSource, TISCopyCurrentASCIICapableKeyboardLayoutInputSource] {
            guard let source = copy()?.takeRetainedValue(),
                  let property = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else { continue }
            return Unmanaged<CFData>.fromOpaque(property).takeUnretainedValue() as Data
        }
        return nil
    }

    private static func translate(_ code: CGKeyCode, in layout: UnsafePointer<UCKeyboardLayout>) -> String? {
        var deadKeys: UInt32 = 0
        var characters = [UniChar](repeating: 0, count: 4)
        var length = 0
        // Layouts such as "Dvorak - QWERTY ⌘" switch keys while Command is held.
        let status = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), UInt32(cmdKey >> 8),
                                    UInt32(LMGetKbdType()), OptionBits(kUCKeyTranslateNoDeadKeysBit),
                                    &deadKeys, characters.count, &length, &characters)
        guard status == noErr, length > 0 else { return nil }
        return String(utf16CodeUnits: characters, count: length)
    }
}
