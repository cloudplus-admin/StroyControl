import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Group {
            if session.isRestoring { ProgressView("Загрузка...") }
            else if session.session == nil { LoginView() }
            else { DashboardView() }
        }
    }
}
