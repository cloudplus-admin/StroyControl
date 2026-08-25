import SwiftUI

struct DashboardView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            List {
                Section("Пользователь") {
                    LabeledContent("Имя", value: session.session?.user?.fullName ?? "-")
                    LabeledContent("Компания", value: session.session?.user?.companyName ?? "-")
                }
                Section("Разделы") {
                    Label("Объекты", systemImage: "building.2")
                    Label("Задачи", systemImage: "checklist")
                    Label("Фотоотчеты", systemImage: "camera")
                    Label("Документы", systemImage: "doc")
                }
                Button("Выйти", role: .destructive) { Task { await session.logout() } }
            }
            .navigationTitle("Астрой")
        }
    }
}
