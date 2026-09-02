import SwiftUI

@main
struct AstroyApp: App {
    @State private var session = SessionStore()
    @State private var language = LanguageStore()
    @State private var store = StoreManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(language)
                .environment(store)
                .environment(\.locale, language.locale)
                .task {
                    await session.restore()
                    await store.prepare()
                }
        }
    }
}
