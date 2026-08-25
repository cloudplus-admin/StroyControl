import SwiftUI

struct DashboardView: View {
    @Environment(SessionStore.self) private var session
    @State private var projects: [Project] = []
    @State private var isLoading = true
    @State private var error = ""

    private var tasks: [ProjectTask] { projects.flatMap(\.tasks) }
    private var documents: [ProjectDocument] { projects.flatMap { $0.documents ?? [] } }
    private var reports: [PhotoReport] { projects.flatMap { $0.photoReports ?? [] } }

    var body: some View {
        TabView {
            NavigationStack { objectsView }
                .tabItem { Label("Объекты", systemImage: "building.2") }
            NavigationStack { tasksView }
                .tabItem { Label("Задачи", systemImage: "checklist") }
            NavigationStack { reportsView }
                .tabItem { Label("Фото", systemImage: "camera") }
            NavigationStack { documentsView }
                .tabItem { Label("Документы", systemImage: "doc") }
            NavigationStack { profileView }
                .tabItem { Label("Профиль", systemImage: "person") }
        }
        .task { await load() }
    }

    @ViewBuilder private var objectsView: some View {
        contentList(title: "Объекты") {
            ForEach(projects) { project in
                NavigationLink {
                    ProjectDetailView(project: project)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(project.name).font(.headline)
                        Text(project.address).font(.subheadline).foregroundStyle(.secondary)
                        ProgressView(value: Double(project.progress), total: 100) {
                            Text("Готовность \(project.progress)%")
                        }
                        Text("Открытых задач: \(project.openTaskCount)").font(.caption)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder private var tasksView: some View {
        contentList(title: "Задачи") {
            ForEach(tasks) { task in
                NavigationLink {
                    TaskDetailView(task: task) { await load() }
                } label: {
                    taskRow(task)
                }
            }
        }
    }

    private func taskRow(_ task: ProjectTask) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(task.title).font(.headline)
            Text("\(task.stage) - \(task.assignee)").font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Label(task.due, systemImage: "calendar")
                Spacer()
                Text(statusTitle(task.status)).foregroundStyle(statusColor(task.status))
            }.font(.caption)
        }.padding(.vertical, 4)
    }

    @ViewBuilder private var reportsView: some View {
        contentList(title: "Фотоотчеты") {
            ForEach(reports) { report in
                LabeledContent(report.point ?? "Фотоотчет", value: statusTitle(report.status ?? ""))
            }
        }
    }

    @ViewBuilder private var documentsView: some View {
        contentList(title: "Документы") {
            ForEach(documents) { document in
                VStack(alignment: .leading, spacing: 4) {
                    Text(document.name).font(.headline)
                    Text("Версия \(document.version) - \(statusTitle(document.status))")
                        .font(.caption).foregroundStyle(.secondary)
                }.padding(.vertical, 4)
            }
        }
    }

    private var profileView: some View {
        List {
            Section("Пользователь") {
                LabeledContent("Имя", value: session.session?.user?.fullName ?? "-")
                LabeledContent("Компания", value: session.session?.user?.companyName ?? "-")
            }
            Button("Выйти", role: .destructive) { Task { await session.logout() } }
        }.navigationTitle("Профиль")
    }

    private func contentList<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        List {
            if isLoading { ProgressView("Загрузка...") }
            if !error.isEmpty {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Повторить") { Task { await load() } }
                }
            }
            content()
        }
        .navigationTitle(title)
        .refreshable { await load() }
        .overlay {
            if !isLoading && error.isEmpty && projects.isEmpty {
                ContentUnavailableView("Данных пока нет", systemImage: "tray")
            }
        }
    }

    private func load() async {
        guard let current = session.session else { return }
        isLoading = true
        error = ""
        defer { isLoading = false }
        do { projects = try await APIClient.shared.bootstrap(session: current).objects }
        catch { self.error = error.localizedDescription }
    }

    private func statusTitle(_ value: String) -> String {
        switch value {
        case "open": "Открыта"
        case "in_progress": "В работе"
        case "review": "На проверке"
        case "done", "accepted", "approved": "Готово"
        case "rejected": "Отклонено"
        default: value.isEmpty ? "-" : value
        }
    }

    private func statusColor(_ value: String) -> Color {
        switch value {
        case "done", "accepted", "approved": .green
        case "review": .orange
        case "rejected": .red
        default: .secondary
        }
    }
}

private struct ProjectDetailView: View {
    let project: Project

    var body: some View {
        List {
            Section("Объект") {
                LabeledContent("Адрес", value: project.address)
                LabeledContent("Готовность", value: "\(project.progress)%")
                LabeledContent("Открытые задачи", value: "\(project.openTaskCount)")
            }
            Section("Задачи") {
                ForEach(project.tasks) { task in
                    NavigationLink {
                        TaskDetailView(task: task) { }
                    } label: {
                        VStack(alignment: .leading) {
                            Text(task.title)
                            Text(task.assignee).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }.navigationTitle(project.name)
    }
}

private struct TaskDetailView: View {
    @Environment(SessionStore.self) private var session
    let task: ProjectTask
    let onChanged: () async -> Void

    @State private var checklist: [ChecklistItem]
    @State private var updatingItemIds: Set<String> = []
    @State private var error = ""

    init(task: ProjectTask, onChanged: @escaping () async -> Void) {
        self.task = task
        self.onChanged = onChanged
        _checklist = State(initialValue: task.checklist)
    }

    var body: some View {
        List {
            Section("Задача") {
                LabeledContent("Этап", value: task.stage)
                LabeledContent("Ответственный", value: task.assignee)
                LabeledContent("Срок", value: task.due)
                LabeledContent("Приоритет", value: priorityTitle(task.priority))
                LabeledContent("Статус", value: statusTitle(task.status))
                if let description = task.description, !description.isEmpty {
                    Text(description)
                }
            }

            Section("Чек-лист") {
                if checklist.isEmpty {
                    Text("Пунктов пока нет").foregroundStyle(.secondary)
                }
                ForEach(checklist) { item in
                    Button {
                        Task { await toggle(item) }
                    } label: {
                        HStack {
                            Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(item.done ? .green : .secondary)
                            Text(item.text).foregroundStyle(.primary)
                            Spacer()
                            if updatingItemIds.contains(item.id) { ProgressView() }
                        }
                    }
                    .disabled(updatingItemIds.contains(item.id) || task.status == "done")
                }
            }

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle(task.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func toggle(_ item: ChecklistItem) async {
        guard let current = session.session else { return }
        updatingItemIds.insert(item.id)
        error = ""
        defer { updatingItemIds.remove(item.id) }
        do {
            let result = try await APIClient.shared.setChecklistItem(
                taskId: task.id,
                itemId: item.id,
                isDone: !item.done,
                session: current
            )
            if let index = checklist.firstIndex(where: { $0.id == result.id }) {
                checklist[index] = ChecklistItem(id: item.id, text: item.text, done: result.isDone)
            }
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func statusTitle(_ value: String) -> String {
        switch value {
        case "open": "Открыта"
        case "in_progress": "В работе"
        case "review": "На проверке"
        case "done": "Готово"
        default: value
        }
    }

    private func priorityTitle(_ value: String) -> String {
        switch value {
        case "high": "Высокий"
        case "medium": "Средний"
        case "low": "Низкий"
        default: value
        }
    }
}
