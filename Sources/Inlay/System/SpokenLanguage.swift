import Foundation
import NaturalLanguage

/// The language of a finished transcript, detected on device. Parakeet reports
/// no language ID, so detection reads the text and is limited to its languages.
struct SpokenLanguage: Equatable, Sendable {
    let code: String

    /// Parakeet TDT 0.6B v3's 25 European languages.
    static let recognizable = ["bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "hr", "hu", "it",
                               "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "uk"]
    /// Short or ambiguous text ("OK.", "Hello.") shows no language at all.
    static let minimumConfidence = 0.5

    static func detect(in text: String) -> SpokenLanguage? {
        let recognizer = NLLanguageRecognizer()
        recognizer.languageConstraints = recognizable.map { NLLanguage(rawValue: $0) }
        recognizer.processString(text)
        guard let (language, confidence) = recognizer.languageHypotheses(withMaximum: 1).first,
              confidence >= minimumConfidence else { return nil }
        return SpokenLanguage(code: language.rawValue)
    }

    var abbreviation: String { code.uppercased() }

    var name: String { Locale.current.localizedString(forLanguageCode: code) ?? abbreviation }

    /// The flag of the language's most likely region (fr → FR, en → US).
    var flag: String? {
        let likely = Locale.Language(identifier: Locale.Language(identifier: code).maximalIdentifier)
        guard let region = likely.region?.identifier, region.count == 2 else { return nil }
        let scalars = region.uppercased().unicodeScalars.compactMap { UnicodeScalar(127_397 + $0.value) }
        return String(String.UnicodeScalarView(scalars))
    }
}
