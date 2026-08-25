import Foundation

struct Role: Codable, Hashable {
    let code: String
    let objectId: String?
}

struct AuthUser: Codable, Hashable {
    let id: String
    let companyId: String
    let companyName: String
    let email: String
    let fullName: String
    let locale: String
    let roles: [Role]
}

struct Session: Codable, Hashable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: AuthUser?
}

struct RefreshResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

struct BootstrapResponse: Codable {
    let serverTime: String
    let objects: [Project]
}

struct Project: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let address: String
    let progress: Int
    let tasks: [ProjectTask]
    let documents: [ProjectDocument]?
    let photoReports: [PhotoReport]?

    var openTaskCount: Int { tasks.filter { $0.status != "done" }.count }
}

struct ProjectTask: Codable, Hashable, Identifiable {
    let id: String
    let objectId: String
    let stage: String
    let title: String
    let description: String?
    let due: String
    let priority: String
    let assignee: String
    let status: String
    let checklist: [ChecklistItem]
}

struct ChecklistItem: Codable, Hashable, Identifiable {
    let id: String
    let text: String
    let done: Bool
}

struct ChecklistMutationResponse: Codable {
    let id: String
    let isDone: Bool
}

struct UploadResponse: Codable {
    let id: String
    let url: String
    let mimeType: String
    let sizeBytes: Int
}

struct CloseTaskRequest: Codable, Equatable {
    let photoUrls: [String]
    let geoLat: Double
    let geoLng: Double
}

struct ServerErrorResponse: Codable {
    let error: String
}

struct ProjectDocument: Codable, Hashable, Identifiable {
    let id: String
    let objectId: String
    let name: String
    let version: Int
    let uri: String
    let status: String
    let createdAt: String
}

struct PhotoReport: Codable, Hashable, Identifiable {
    let id: String
    let objectId: String
    let point: String?
    let status: String?
    let createdAt: String
}
