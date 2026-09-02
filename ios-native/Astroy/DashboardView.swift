import SwiftUI
import PhotosUI

private enum AppTab: String, CaseIterable, Identifiable {
    case home, objects, tasks, quality, cameras, feed, supply, profile

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "Сводка"
        case .objects: "Объекты"
        case .tasks: "Задачи"
        case .quality: "Контроль"
        case .cameras: "Камеры"
        case .feed: "Лента"
        case .supply: "Учет"
        case .profile: "Профиль"
        }
    }
    var icon: String {
        switch self {
        case .home: "house"
        case .objects: "building.2"
        case .tasks: "checklist"
        case .quality: "checkmark.shield"
        case .cameras: "video"
        case .feed: "text.bubble"
        case .supply: "shippingbox"
        case .profile: "person"
        }
    }
}

struct DashboardView: View {
    @Environment(SessionStore.self) private var session
    @State private var projects: [Project] = []
    @State private var reviewers: [Reviewer] = []
    @State private var isLoading = true
    @State private var error = ""
    @State private var selectedTab: AppTab = .home
    @State private var query = ""
    @State private var taskStatus = "all"
    @State private var showCreateObject = false
    @State private var showCreateTask = false
    @State private var pendingClosureCount = 0
    @State private var selectedPhotoURL: String?

    private var tasks: [ProjectTask] { projects.flatMap(\.tasks) }
    private var documents: [ProjectDocument] { projects.flatMap { $0.documents ?? [] } }
    private var reports: [PhotoReport] { projects.flatMap { $0.photoReports ?? [] } }
    private var defects: [ProjectDefect] { projects.flatMap { $0.defects ?? [] } }
    private var feed: [FeedEvent] { projects.flatMap { $0.feed ?? [] }.sorted { $0.createdAt > $1.createdAt } }

    private var roleCode: String {
        let code = session.session?.user?.roles.first?.code ?? "pm"
        return code == "owner" ? "director" : code
    }

    private var canManage: Bool { ["owner", "director", "admin", "pm"].contains(roleCode) }

    private var tabs: [AppTab] {
        switch roleCode {
        case "inspector": [.home, .tasks, .quality, .feed, .profile]
        case "supplier": [.home, .supply, .feed, .profile]
        case "finance": [.home, .objects, .feed, .profile]
        case "foreman", "subcontractor": [.home, .objects, .tasks, .feed, .profile]
        default: [.home, .objects, .tasks, .cameras, .feed, .profile]
        }
    }

    private var filteredProjects: [Project] {
        guard !query.isEmpty else { return projects }
        return projects.filter { "\($0.name) \($0.address)".localizedCaseInsensitiveContains(query) }
    }

    private var filteredTasks: [ProjectTask] {
        tasks.filter { task in
            (taskStatus == "all" || task.status == taskStatus) &&
            (query.isEmpty || "\(task.title) \(task.stage) \(task.assignee)".localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if pendingClosureCount > 0 {
                        Label("Ожидают отправки: \(pendingClosureCount)", systemImage: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.orange)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                    if isLoading { ProgressView("Загрузка...").frame(maxWidth: .infinity) }
                    if !error.isEmpty {
                        Text(error).foregroundStyle(.red)
                        Button("Повторить") { Task { await load() } }
                    }
                    selectedContent
                }
                .padding(16)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.always)
            .scrollIndicators(.visible)
            .refreshable { await load() }
            .navigationTitle(selectedTab.title)
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomNavigation }
        }
        .task { await load() }
        .sheet(isPresented: $showCreateObject) {
            ObjectCreationView {
                showCreateObject = false
                await load()
            }
        }
        .sheet(isPresented: $showCreateTask) {
            TaskCreationView(projects: projects) {
                showCreateTask = false
                await load()
            }
        }
        .fullScreenCover(
            isPresented: Binding(
                get: { selectedPhotoURL != nil },
                set: { if !$0 { selectedPhotoURL = nil } }
            )
        ) {
            if let selectedPhotoURL, let current = session.session {
                FullScreenPhotoView(url: selectedPhotoURL, session: current) {
                    self.selectedPhotoURL = nil
                }
            }
        }
    }

    @ViewBuilder private var selectedContent: some View {
        switch selectedTab {
        case .home: homeView
        case .objects: objectsView
        case .tasks: tasksView
        case .quality: qualityView
        case .cameras: camerasView
        case .feed: feedView
        case .supply: supplyView
        case .profile: profileView
        }
    }

    private var bottomNavigation: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(tabs) { tab in
                    Button {
                        selectedTab = tab
                        query = ""
                    } label: {
                        VStack(spacing: 3) {
                            Image(systemName: tab.icon).font(.system(size: 18, weight: .semibold))
                            Text(tab.title).font(.caption2).lineLimit(1)
                        }
                        .foregroundStyle(selectedTab == tab ? Color.accentColor : Color.secondary)
                        .frame(minWidth: 64)
                        .padding(.vertical, 8)
                    }
                }
            }
            .padding(.horizontal, 8)
        }
        .background(.ultraThinMaterial)
    }

    private var homeView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("StroyControl").font(.title.bold())
            Text(session.session?.user?.fullName ?? "").foregroundStyle(.secondary)
            HStack(spacing: 10) {
                metric(title: "Объекты", value: projects.count, color: .blue)
                metric(title: "Открытые", value: tasks.filter { $0.status != "done" }.count, color: .orange)
                metric(title: "Дефекты", value: defects.filter { $0.status != "closed" }.count, color: .red)
            }
            Text("Ход строительства").font(.headline)
            ForEach(projects.prefix(4)) { project in projectCard(project) }
        }
    }

    private func metric(title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)").font(.title2.bold()).foregroundStyle(color)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
    }

    private var objectsView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if canManage {
                Button { showCreateObject = true } label: { Label("Новый объект", systemImage: "plus") }
                    .buttonStyle(.borderedProminent)
            }
            searchField("Поиск по объекту или адресу")
            if filteredProjects.isEmpty { ContentUnavailableView("Объекты не найдены", systemImage: "building.2") }
            ForEach(filteredProjects) { project in
                NavigationLink {
                    ProjectDetailView(project: project)
                } label: {
                    projectCard(project)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func projectCard(_ project: Project) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text(project.name).font(.headline); Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary) }
            Text(project.address).font(.subheadline).foregroundStyle(.secondary)
            ProgressView(value: Double(project.progress), total: 100) { Text("Готовность \(project.progress)%") }
            Text("Открытых задач: \(project.openTaskCount)").font(.caption)
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.07), radius: 10, y: 4)
    }

    private var tasksView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if canManage {
                Button { showCreateTask = true } label: { Label("Поставить задачу", systemImage: "plus") }
                    .buttonStyle(.borderedProminent)
            }
            searchField("Поиск по задаче, этапу или исполнителю")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(["all", "open", "in_progress", "review", "done"], id: \.self) { value in
                        Button(taskFilterTitle(value)) { taskStatus = value }
                            .buttonStyle(.borderedProminent)
                            .tint(taskStatus == value ? .accentColor : .gray.opacity(0.35))
                    }
                }
            }
            if filteredTasks.isEmpty { ContentUnavailableView("Задач по фильтру нет", systemImage: "checklist") }
            ForEach(filteredTasks) { task in
                NavigationLink {
                    TaskDetailView(task: task, onChanged: { await load() }, reviewers: reviewers)
                } label: {
                    taskRow(task).cardStyle()
                }
                .buttonStyle(.plain)
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

    private var qualityView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Фото и технадзор").font(.title2.bold())
            ForEach(reports) { report in
                VStack(alignment: .leading, spacing: 10) {
                    LabeledContent(report.point ?? "Фотоотчет", value: statusTitle(report.status ?? ""))
                    if !report.imageURLs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(report.imageURLs, id: \.self) { url in
                                    Button { selectedPhotoURL = url } label: {
                                        AuthenticatedThumbnail(url: url)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }.cardStyle()
            }
            ForEach(defects) { defect in
                LabeledContent(defect.description, value: statusTitle(defect.status)).cardStyle()
            }
            if reports.isEmpty && defects.isEmpty { ContentUnavailableView("Записей пока нет", systemImage: "checkmark.shield") }
        }
    }

    private var camerasView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Камеры объектов").font(.title2.bold())
            ForEach(projects) { project in
                HStack { Image(systemName: "video").foregroundStyle(.green); Text(project.name); Spacer(); Text("Онлайн").foregroundStyle(.green) }.cardStyle()
            }
        }
    }

    private var feedView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Лента и документы").font(.title2.bold())
            ForEach(feed) { event in
                VStack(alignment: .leading, spacing: 5) {
                    Text(event.author).font(.headline)
                    Text(event.body)
                    Text(event.createdAt).font(.caption).foregroundStyle(.secondary)
                }.cardStyle()
            }
            ForEach(documents) { document in
                VStack(alignment: .leading, spacing: 4) {
                    Text(document.name).font(.headline)
                    Text("Версия \(document.version) - \(statusTitle(document.status))")
                        .font(.caption).foregroundStyle(.secondary)
                }.cardStyle()
            }
            if feed.isEmpty && documents.isEmpty { ContentUnavailableView("Лента пока пуста", systemImage: "text.bubble") }
        }
    }

    private var supplyView: some View {
        ContentUnavailableView("Учет материалов", systemImage: "shippingbox", description: Text("Данные учета подключаются к серверу"))
    }

    private var profileView: some View {
        VStack(alignment: .leading, spacing: 14) {
            LabeledContent("Имя", value: session.session?.user?.fullName ?? "-").cardStyle()
            LabeledContent("Компания", value: session.session?.user?.companyName ?? "-").cardStyle()
            LabeledContent("Роль", value: roleCode).cardStyle()
            Button("Выйти", role: .destructive) { Task { await session.logout() } }
                .buttonStyle(.borderedProminent)
        }
    }

    private func searchField(_ placeholder: String) -> some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(placeholder, text: $query)
            if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill") } }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
    }

    private func load() async {
        guard let current = session.session else { return }
        isLoading = true
        error = ""
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.bootstrap(session: current)
            projects = response.objects
            reviewers = response.reviewers ?? []
            await syncPendingClosures(session: current)
        }
        catch APIError.invalidCredentials {
            do {
                let refreshed = try await session.refresh()
                let response = try await APIClient.shared.bootstrap(session: refreshed)
                projects = response.objects
                reviewers = response.reviewers ?? []
                await syncPendingClosures(session: refreshed)
            } catch { self.error = error.localizedDescription }
        }
        catch { self.error = error.localizedDescription }
    }

    private func syncPendingClosures(session: Session) async {
        let pending = await OfflineQueue.shared.all()
        pendingClosureCount = pending.count
        for operation in pending {
            do {
                try await APIClient.shared.submit(operation, session: session)
                try await OfflineQueue.shared.remove(id: operation.id)
                pendingClosureCount -= 1
            } catch {
                break
            }
        }
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

    private func taskFilterTitle(_ value: String) -> String {
        switch value {
        case "open": "Открытые"
        case "in_progress": "В работе"
        case "review": "На проверке"
        case "done": "Готово"
        default: "Все"
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

private struct AuthenticatedThumbnail: View {
    @Environment(SessionStore.self) private var session
    let url: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    Color.secondary.opacity(0.12)
                    ProgressView()
                }
            }
        }
        .frame(width: 112, height: 84)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .task(id: url) {
            guard let current = session.session,
                  let data = try? await APIClient.shared.imageData(url: url, session: current) else { return }
            image = UIImage(data: data)
        }
    }
}

private struct FullScreenPhotoView: View {
    let url: String
    let session: Session
    let close: () -> Void
    @State private var image: UIImage?
    @State private var error = false
    @State private var scale = 1.0
    @State private var lastScale = 1.0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .gesture(
                            MagnifyGesture()
                                .onChanged { value in scale = min(max(lastScale * value.magnification, 1), 5) }
                                .onEnded { _ in lastScale = scale }
                        )
                        .onTapGesture(count: 2) {
                            withAnimation { scale = scale > 1 ? 1 : 2; lastScale = scale }
                        }
                } else if error {
                    ContentUnavailableView("Фото не загрузилось", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.white)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button(action: close) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(.white, .black.opacity(0.55))
            }
            .padding(20)
        }
        .task {
            do {
                let data = try await APIClient.shared.imageData(url: url, session: session)
                image = UIImage(data: data)
                error = image == nil
            } catch { error = true }
        }
    }
}

private struct ObjectCreationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let created: () async -> Void

    @State private var name = ""
    @State private var address = ""
    @State private var templateCode = "typical_house"
    @State private var isSaving = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Объект") {
                    TextField("Название", text: $name)
                    TextField("Адрес", text: $address)
                    Picker("Тип", selection: $templateCode) {
                        Text("Типовой дом").tag("typical_house")
                        Text("Многоэтажный дом").tag("high_rise")
                        Text("Реконструкция").tag("renovation")
                    }
                }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Новый объект")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await save() } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
    }

    private func save() async {
        guard let current = session.session else { return }
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            try await APIClient.shared.createObject(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                address: address.trimmingCharacters(in: .whitespacesAndNewlines),
                templateCode: templateCode,
                session: current
            )
            await created()
        } catch { self.error = error.localizedDescription }
    }
}

private struct TaskCreationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let projects: [Project]
    let created: () async -> Void

    @State private var title = ""
    @State private var projectId = ""
    @State private var sections: [PlanningSection] = []
    @State private var sectionId = ""
    @State private var priority = "normal"
    @State private var due = Date()
    @State private var hasDeadline = false
    @State private var isSaving = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Задача") {
                    TextField("Название", text: $title)
                    Picker("Объект", selection: $projectId) {
                        ForEach(projects) { Text($0.name).tag($0.id) }
                    }
                    Picker("Раздел работ", selection: $sectionId) {
                        ForEach(sections) { Text($0.name).tag($0.id) }
                    }
                    Picker("Приоритет", selection: $priority) {
                        Text("Низкий").tag("low")
                        Text("Обычный").tag("normal")
                        Text("Высокий").tag("high")
                    }
                    Toggle("Указать срок", isOn: $hasDeadline)
                    if hasDeadline { DatePicker("Срок", selection: $due, displayedComponents: [.date, .hourAndMinute]) }
                }
                if sections.isEmpty && !projectId.isEmpty { Text("В объекте нет разделов работ").foregroundStyle(.secondary) }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Новая задача")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") { Task { await save() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || sectionId.isEmpty || isSaving)
                }
            }
            .task {
                if projectId.isEmpty { projectId = projects.first?.id ?? "" }
                await loadSections()
            }
            .onChange(of: projectId) { _, _ in Task { await loadSections() } }
        }
    }

    private func loadSections() async {
        guard let current = session.session, !projectId.isEmpty else { return }
        do {
            sections = try await APIClient.shared.objectPlanning(objectId: projectId, session: current).stages.flatMap(\.sections)
            sectionId = sections.first?.id ?? ""
        } catch { self.error = error.localizedDescription }
    }

    private func save() async {
        guard let current = session.session else { return }
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            let formatter = ISO8601DateFormatter()
            _ = try await APIClient.shared.createTask(
                sectionId: sectionId,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                priority: priority,
                plannedEnd: hasDeadline ? formatter.string(from: due) : nil,
                session: current
            )
            await created()
        } catch { self.error = error.localizedDescription }
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
                        TaskDetailView(task: task, onChanged: { })
                    } label: {
                        VStack(alignment: .leading) {
                            Text(task.title)
                            Text(task.assignee).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .scrollBounceBehavior(.always)
        .navigationTitle(project.name)
    }
}

private struct TaskDetailView: View {
    @Environment(SessionStore.self) private var session
    let task: ProjectTask
    let onChanged: () async -> Void
    let reviewers: [Reviewer]

    @State private var checklist: [ChecklistItem]
    @State private var updatingItemIds: Set<String> = []
    @State private var error = ""
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var showCamera = false
    @State private var isClosing = false
    @State private var isClosed = false
    @State private var closeOperationId: String?
    @State private var isEditing = false
    @State private var editTitle = ""
    @State private var editDescription = ""
    @State private var editPriority = "normal"
    @State private var isSaving = false
    @State private var isAssigningReviewer = false
    @State private var reviewNote = ""
    @State private var isReviewing = false
    @StateObject private var locationProvider = TaskLocationProvider()

    init(task: ProjectTask, onChanged: @escaping () async -> Void, reviewers: [Reviewer] = []) {
        self.task = task
        self.onChanged = onChanged
        self.reviewers = reviewers
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
                if canManage {
                    Button("Редактировать задачу") {
                        editTitle = task.title
                        editDescription = task.description ?? ""
                        editPriority = task.priority
                        isEditing = true
                    }
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

            if canManage && !reviewers.isEmpty {
                Section("Технадзор") {
                    Text(task.reviewerName ?? "Проверяющий не назначен").foregroundStyle(.secondary)
                    Menu("Назначить проверяющего") {
                        ForEach(reviewers.filter { $0.objectIds.isEmpty || $0.objectIds.contains(task.objectId) }) { reviewer in
                            Button(reviewer.name) { Task { await assign(reviewer) } }
                        }
                    }
                    .disabled(isAssigningReviewer)
                }
            }

            if isInspector && task.status == "review" {
                Section("Решение технадзора") {
                    TextField("Комментарий, обязателен при отклонении", text: $reviewNote, axis: .vertical)
                    Button("Принять работу") { Task { await review(accepted: true) } }
                        .disabled(isReviewing)
                    Button("Отклонить", role: .destructive) { Task { await review(accepted: false) } }
                        .disabled(reviewNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isReviewing)
                }
            }

            if task.status != "done" && !isClosed {
                Section("Закрытие задачи") {
                    if let photoData, let image = UIImage(data: photoData) {
                        Image(uiImage: image)
                            .resizable().scaledToFit().frame(maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Label(photoData == nil ? "Выбрать фото" : "Заменить фото", systemImage: "photo")
                    }
                    Button { showCamera = true } label: { Label("Сделать фото", systemImage: "camera") }
                        .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                    Button { Task { await closeTask() } } label: {
                        HStack {
                            Text("Закрыть задачу")
                            Spacer()
                            if isClosing { ProgressView() }
                        }
                    }
                    .disabled(photoData == nil || isClosing)
                }
            } else {
                Section { Label("Задача завершена", systemImage: "checkmark.seal.fill").foregroundStyle(.green) }
            }

            if !error.isEmpty {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .scrollBounceBehavior(.always)
        .navigationTitle(task.title)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task {
                do {
                    guard let source = try await item.loadTransferable(type: Data.self),
                          let image = UIImage(data: source),
                          let jpeg = image.jpegData(compressionQuality: 0.82) else {
                        self.error = "Не удалось открыть выбранное фото"
                        return
                    }
                    photoData = jpeg
                    closeOperationId = nil
                }
                catch { self.error = "Не удалось открыть выбранное фото" }
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                photoData = image.jpegData(compressionQuality: 0.82)
                closeOperationId = nil
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $isEditing) {
            NavigationStack {
                Form {
                    TextField("Название", text: $editTitle)
                    TextField("Описание", text: $editDescription, axis: .vertical).lineLimit(3...8)
                    Picker("Приоритет", selection: $editPriority) {
                        Text("Низкий").tag("low")
                        Text("Обычный").tag("normal")
                        Text("Высокий").tag("high")
                    }
                    if !error.isEmpty { Text(error).foregroundStyle(.red) }
                }
                .navigationTitle("Редактирование")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { isEditing = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Сохранить") { Task { await saveTask() } }
                            .disabled(editTitle.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                    }
                }
            }
        }
    }

    private var canManage: Bool {
        session.session?.user?.roles.contains { ["admin", "owner", "pm"].contains($0.code) } == true
    }

    private var isInspector: Bool {
        session.session?.user?.roles.contains { $0.code == "inspector" } == true
    }

    private func saveTask() async {
        guard let current = session.session else { return }
        isSaving = true
        error = ""
        defer { isSaving = false }
        do {
            try await APIClient.shared.updateTask(
                taskId: task.id,
                title: editTitle.trimmingCharacters(in: .whitespacesAndNewlines),
                description: editDescription.trimmingCharacters(in: .whitespacesAndNewlines),
                priority: editPriority,
                session: current
            )
            isEditing = false
            await onChanged()
        } catch { self.error = error.localizedDescription }
    }

    private func assign(_ reviewer: Reviewer) async {
        guard let current = session.session else { return }
        isAssigningReviewer = true
        error = ""
        defer { isAssigningReviewer = false }
        do {
            try await APIClient.shared.assignReviewer(taskId: task.id, reviewerId: reviewer.id, session: current)
            await onChanged()
        } catch { self.error = error.localizedDescription }
    }

    private func review(accepted: Bool) async {
        guard let current = session.session else { return }
        isReviewing = true
        error = ""
        defer { isReviewing = false }
        do {
            try await APIClient.shared.reviewTask(
                taskId: task.id,
                accepted: accepted,
                note: reviewNote.trimmingCharacters(in: .whitespacesAndNewlines),
                session: current
            )
            await onChanged()
        } catch { self.error = error.localizedDescription }
    }

    private func closeTask() async {
        guard let current = session.session, let photoData else { return }
        isClosing = true
        error = ""
        defer { isClosing = false }
        do {
            let location = try await locationProvider.currentLocation()
            let operationId = closeOperationId ?? UUID().uuidString
            closeOperationId = operationId
            let pending = PendingTaskClosure(
                id: operationId,
                taskId: task.id,
                photoData: photoData,
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                createdAt: Date()
            )
            do {
                try await APIClient.shared.submit(pending, session: current)
            } catch APIError.serverUnavailable {
                try await OfflineQueue.shared.enqueue(pending)
                isClosed = true
                closeOperationId = nil
                self.error = "Нет сети. Закрытие задачи сохранено и отправится автоматически"
                await onChanged()
                return
            } catch let urlError as URLError {
                try await OfflineQueue.shared.enqueue(pending)
                isClosed = true
                closeOperationId = nil
                self.error = urlError.code == .notConnectedToInternet
                    ? "Нет сети. Закрытие задачи сохранено и отправится автоматически"
                    : "Связь прервалась. Закрытие задачи сохранено и отправится автоматически"
                await onChanged()
                return
            }
            isClosed = true
            closeOperationId = nil
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
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
        case "normal": "Средний"
        case "low": "Низкий"
        default: value
        }
    }
}

private extension View {
    func cardStyle() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.07), radius: 10, y: 4)
    }
}
