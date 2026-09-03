import Foundation
import Observation

@MainActor @Observable
final class SessionStore {
    var session: Session?
    var isRestoring = true

    func restore() async {
        defer { isRestoring = false }
        guard let data = KeychainStore.load() else { return }
        guard let stored = try? JSONDecoder().decode(Session.self, from: data) else {
            KeychainStore.remove()
            return
        }
        do {
            session = try await APIClient.shared.refresh(session: stored)
            try persist()
        } catch APIError.serverUnavailable {
            session = stored
        } catch {
            KeychainStore.remove()
            session = nil
        }
    }

    func login(email: String, password: String) async throws {
        let value = try await APIClient.shared.login(email: email, password: password)
        try KeychainStore.save(JSONEncoder().encode(value))
        session = value
    }

    @discardableResult
    func refresh() async throws -> Session {
        guard let current = session else { throw APIError.invalidCredentials }
        do {
            let updated = try await APIClient.shared.refresh(session: current)
            session = updated
            try persist()
            return updated
        } catch APIError.invalidCredentials {
            KeychainStore.remove()
            session = nil
            throw APIError.invalidCredentials
        }
    }

    func logout() async {
        if let session { await APIClient.shared.logout(session: session) }
        KeychainStore.remove()
        session = nil
    }

    func deleteAccount() async throws {
        guard let current = session else { throw APIError.invalidCredentials }
        try await APIClient.shared.deleteAccount(session: current)
        KeychainStore.remove()
        session = nil
    }

    private func persist() throws {
        guard let session else { return }
        try KeychainStore.save(JSONEncoder().encode(session))
    }
}
