import SwiftUI

@main
struct AstroyApp: App {
    @State private var session = SessionStore()
    @State private var language = LanguageStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(language)
                .environment(\.locale, language.locale)
                .task { await session.restore() }
        }
    }
}
