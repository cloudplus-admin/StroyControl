import Foundation

enum APIError: LocalizedError {
    case invalidCredentials, serverUnavailable, invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: "Неверный логин или пароль"
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

    func logout(session: Session) async {
        var request = authorizedRequest(path: "/api/auth/logout", session: session)
        request.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: request)
    }

    func bootstrap(session: Session) async throws -> BootstrapResponse {
        let request = authorizedRequest(path: "/api/mobile/bootstrap", session: session)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.serverUnavailable }
        do {
            return try decoder.decode(BootstrapResponse.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
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
