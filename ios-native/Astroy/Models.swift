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
    let reviewers: [Reviewer]?
    let objects: [Project]
}

struct Reviewer: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let objectIds: [String]
}

struct CreatedEntity: Codable {
    let id: String
}

struct ObjectPlanning: Codable {
    let stages: [PlanningStage]
}

struct PlanningStage: Codable, Identifiable {
    let id: String
    let name: String
    let sections: [PlanningSection]
}

struct PlanningSection: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct Project: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let address: String
    let progress: Int
    let tasks: [ProjectTask]
    let documents: [ProjectDocument]?
    let photoReports: [PhotoReport]?
    let defects: [ProjectDefect]?
    let feed: [FeedEvent]?

    var openTaskCount: Int { tasks.filter { $0.status != "done" }.count }
}

struct ProjectDefect: Codable, Hashable, Identifiable {
    let id: String
    let objectId: String
    let description: String
    let status: String
    let createdAt: String
}

struct FeedEvent: Codable, Hashable, Identifiable {
    let id: String
    let objectId: String
    let author: String
    let body: String
    let reactions: Int
    let createdAt: String
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
    let assigneeId: String?
    let status: String
    let reviewerId: String?
    let reviewerName: String?
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
    let fileUrl: String?
    let photos: [PhotoReportPhoto]?
    let status: String?
    let createdAt: String

    var imageURLs: [String] {
        var values = photos?.map(\.uri) ?? []
        if let fileUrl, !values.contains(fileUrl) { values.insert(fileUrl, at: 0) }
        return values
    }
}

struct PhotoReportPhoto: Codable, Hashable {
    let angle: String
    let uri: String
}
