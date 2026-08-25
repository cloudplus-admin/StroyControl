import Foundation
import Observation

@MainActor @Observable
final class SessionStore {
    var session: Session?
    var isRestoring = true

    func restore() async {
        defer { isRestoring = false }
        guard let data = KeychainStore.load() else { return }
        session = try? JSONDecoder().decode(Session.self, from: data)
    }

    func login(email: String, password: String) async throws {
        let value = try await APIClient.shared.login(email: email, password: password)
        try KeychainStore.save(JSONEncoder().encode(value))
        session = value
    }

    func logout() async {
        if let session { await APIClient.shared.logout(session: session) }
        KeychainStore.remove()
        session = nil
    }
}
