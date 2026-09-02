import Foundation

enum APIError: LocalizedError {
    case invalidCredentials, forbidden, conflict(String), serverUnavailable, invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: L10n.text("Неверный логин или пароль")
        case .forbidden: L10n.text("Недостаточно прав для выполнения действия")
        case .conflict(let message): message
        case .serverUnavailable: L10n.text("Сервер временно недоступен")
        case .invalidResponse: L10n.text("Получен некорректный ответ сервера")
        }
    }
}

actor APIClient {
    static let shared = APIClient()
    private let baseURL = URL(string: "https://stroycontrol-api.cloudplus.uz")!
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func login(email: String, password: String) async throws -> Session {
        var request = URLRequest(url: baseURL.appending(path: "/api/auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(["email": email, "password": password])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
        return try decoder.decode(Session.self, from: data)
    }

    func refresh(session: Session) async throws -> Session {
        var request = URLRequest(url: baseURL.appending(path: "/api/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(["refreshToken": session.refreshToken])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
        let tokens = try decoder.decode(RefreshResponse.self, from: data)
        return Session(
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            user: session.user
        )
    }

    func logout(session: Session) async {
        var request = authorizedRequest(path: "/api/auth/logout", session: session)
        request.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: request)
    }

    func bootstrap(session: Session) async throws -> BootstrapResponse {
        let request = authorizedRequest(path: "/api/mobile/bootstrap", session: session)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
        do {
            return try decoder.decode(BootstrapResponse.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    func imageData(url: String, session: Session) async throws -> Data {
        guard let resolvedURL = URL(string: url) else { throw APIError.invalidResponse }
        var request = URLRequest(url: resolvedURL)
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let companyId = session.user?.companyId {
            request.setValue(companyId, forHTTPHeaderField: "x-company-id")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return data
    }

    func createObject(name: String, address: String, templateCode: String, session: Session) async throws {
        var request = authorizedRequest(path: "/api/objects", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode([
            "name": name,
            "address": address,
            "templateCode": templateCode,
        ])
        let (_, response) = try await URLSession.shared.data(for: request)
        try validate(response)
    }

    func objectPlanning(objectId: String, session: Session) async throws -> ObjectPlanning {
        let request = authorizedRequest(path: "/api/objects/\(objectId)", session: session)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        do { return try decoder.decode(ObjectPlanning.self, from: data) }
        catch { throw APIError.invalidResponse }
    }

    func createTask(sectionId: String, title: String, priority: String, plannedEnd: String?, session: Session) async throws -> CreatedEntity {
        var request = authorizedRequest(path: "/api/objects/sections/\(sectionId)/tasks", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload: [String: Any] = ["title": title, "priority": priority, "dependsOn": [] as [String]]
        if let plannedEnd, !plannedEnd.isEmpty { payload["plannedEnd"] = plannedEnd }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        do { return try decoder.decode(CreatedEntity.self, from: data) }
        catch { throw APIError.invalidResponse }
    }

    func updateTask(taskId: String, title: String, description: String, priority: String, session: Session) async throws {
        var request = authorizedRequest(path: "/api/tasks/\(taskId)", session: session)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode([
            "title": title,
            "description": description,
            "priority": priority,
        ])
        let (_, response) = try await URLSession.shared.data(for: request)
        try validate(response)
    }

    func assignReviewer(taskId: String, reviewerId: String, session: Session) async throws {
        var request = authorizedRequest(path: "/api/tasks/\(taskId)/reviewer", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(["reviewerId": reviewerId])
        let (_, response) = try await URLSession.shared.data(for: request)
        try validate(response)
    }

    func reviewTask(taskId: String, accepted: Bool, note: String, session: Session) async throws {
        var request = authorizedRequest(path: "/api/tasks/\(taskId)/review", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios-review-\(UUID().uuidString)", forHTTPHeaderField: "idempotency-key")
        request.httpBody = try encoder.encode([
            "decision": accepted ? "accepted" : "rejected",
            "note": note,
        ])
        let (_, response) = try await URLSession.shared.data(for: request)
        try validate(response)
    }

    func setChecklistItem(taskId: String, itemId: String, isDone: Bool, session: Session) async throws -> ChecklistMutationResponse {
        var request = authorizedRequest(
            path: "/api/tasks/\(taskId)/checklist/\(itemId)",
            session: session
        )
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(["isDone": isDone])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        if http.statusCode == 403 { throw APIError.forbidden }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
        do {
            return try decoder.decode(ChecklistMutationResponse.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    func uploadTaskPhoto(taskId: String, data: Data, session: Session, idempotencyKey: String) async throws -> UploadResponse {
        var request = authorizedRequest(path: "/api/uploads", session: session)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue("task-photo.jpg", forHTTPHeaderField: "x-file-name")
        request.setValue(taskId, forHTTPHeaderField: "x-task-id")
        request.setValue(idempotencyKey, forHTTPHeaderField: "idempotency-key")
        request.httpBody = data
        let (responseData, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        do { return try decoder.decode(UploadResponse.self, from: responseData) }
        catch { throw APIError.invalidResponse }
    }

    func closeTask(taskId: String, photoURL: String, latitude: Double, longitude: Double, session: Session, idempotencyKey: String) async throws {
        var request = authorizedRequest(path: "/api/tasks/\(taskId)/close", session: session)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(idempotencyKey, forHTTPHeaderField: "idempotency-key")
        request.httpBody = try encoder.encode(CloseTaskRequest(photoUrls: [photoURL], geoLat: latitude, geoLng: longitude))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        if http.statusCode == 403 { throw APIError.forbidden }
        if http.statusCode == 409 {
            let message = (try? decoder.decode(ServerErrorResponse.self, from: data).error) ?? "Задачу пока нельзя закрыть"
            throw APIError.conflict(message == "Complete every checklist item before closing the task"
                ? L10n.text("Сначала отметь все пункты чек-листа")
                : L10n.text("Сначала заверши связанные задачи"))
        }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
    }

    func submit(_ pending: PendingTaskClosure, session: Session) async throws {
        let upload = try await uploadTaskPhoto(
            taskId: pending.taskId,
            data: pending.photoData,
            session: session,
            idempotencyKey: "ios-close-photo-\(pending.id)"
        )
        try await closeTask(
            taskId: pending.taskId,
            photoURL: upload.url,
            latitude: pending.latitude,
            longitude: pending.longitude,
            session: session,
            idempotencyKey: "ios-close-task-\(pending.id)"
        )
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.invalidCredentials }
        if http.statusCode == 403 { throw APIError.forbidden }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
    }

    private func authorizedRequest(path: String, session: Session) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let companyId = session.user?.companyId {
            request.setValue(companyId, forHTTPHeaderField: "x-company-id")
        }
        return request
    }
}
