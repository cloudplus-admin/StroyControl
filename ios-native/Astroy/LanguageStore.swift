import Foundation
import Observation

enum AppLanguage: String, CaseIterable, Identifiable {
    case ru, uz, en

    var id: String { rawValue }
    var localeIdentifier: String {
        switch self {
        case .ru: "ru_RU"
        case .uz: "uz_UZ"
        case .en: "en_US"
        }
    }
    var title: String {
        switch self {
        case .ru: "Русский"
        case .uz: "O'zbekcha"
        case .en: "English"
        }
    }
}

@Observable
final class LanguageStore {
    private static let key = "astroy.app-language"
    var selected: AppLanguage {
        didSet { UserDefaults.standard.set(selected.rawValue, forKey: Self.key) }
    }

    init() {
        let saved = UserDefaults.standard.string(forKey: Self.key)
        selected = AppLanguage(rawValue: saved ?? "") ?? .ru
    }

    var locale: Locale { Locale(identifier: selected.localeIdentifier) }
    func text(_ key: String) -> String { L10n.text(key, language: selected) }
}

enum L10n {
    static func text(_ key: String, language: AppLanguage? = nil) -> String {
        let selected = language ?? AppLanguage(
            rawValue: UserDefaults.standard.string(forKey: "astroy.app-language") ?? ""
        ) ?? .ru
        guard selected != .ru,
              let path = Bundle.main.path(forResource: selected.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else { return key }
        return bundle.localizedString(forKey: key, value: key, table: nil)
    }
}
