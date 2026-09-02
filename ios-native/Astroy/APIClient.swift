import Foundation

enum APIError: LocalizedError {
    case invalidCredentials, forbidden, conflict(String), serverUnavailable, invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: "Неверный логин или пароль"
        case .forbidden: "Недостаточно прав для выполнения действия"
        case .conflict(let message): message
        case .serverUnavailable: "Сервер временно недоступен"
        case .invalidResponse: "Получен некорректный ответ сервера"
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
            throw APIError.conflict(message == "Complete every checklist item before closing the task" ? "Сначала отметь все пункты чек-листа" : "Сначала заверши связанные задачи")
        }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
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
