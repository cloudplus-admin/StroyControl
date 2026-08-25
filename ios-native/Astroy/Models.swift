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
