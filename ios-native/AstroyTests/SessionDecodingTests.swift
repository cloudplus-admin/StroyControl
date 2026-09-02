import XCTest
@testable import Astroy

final class SessionDecodingTests: XCTestCase {
    func testDecodesProductionLoginShape() throws {
        let json = #"{"accessToken":"a","refreshToken":"r","expiresIn":900,"user":{"id":"1","companyId":"2","companyName":"CloudPlus","email":"user@example.com","fullName":"User","locale":"ru","roles":[{"code":"FOREMAN","objectId":null}]}}"#.data(using: .utf8)!
        let session = try JSONDecoder().decode(Session.self, from: json)
        XCTAssertEqual(session.user?.roles.first?.code, "FOREMAN")
    }

    func testDecodesBootstrapObjectsAndTasks() throws {
        let json = #"{"serverTime":"2026-08-25T09:00:00.000Z","objects":[{"id":"o1","name":"ЖК Астрой","address":"Ташкент","progress":42,"tasks":[{"id":"t1","objectId":"o1","stage":"Каркас","title":"Колонны","description":null,"due":"2026-09-01","priority":"high","assignee":"Прораб","status":"in_progress","checklist":[]}],"documents":[],"photoReports":[]}]}"#.data(using: .utf8)!
        let response = try JSONDecoder().decode(BootstrapResponse.self, from: json)
        XCTAssertEqual(response.objects.first?.openTaskCount, 1)
        XCTAssertEqual(response.objects.first?.tasks.first?.title, "Колонны")
    }

    func testDecodesChecklistMutationResponse() throws {
        let json = #"{"id":"c1","taskId":"t1","label":"Проверить каски","isDone":true}"#.data(using: .utf8)!
        let response = try JSONDecoder().decode(ChecklistMutationResponse.self, from: json)
        XCTAssertEqual(response.id, "c1")
        XCTAssertTrue(response.isDone)
    }

    func testEncodesTaskClosureContract() throws {
        let request = CloseTaskRequest(
            photoUrls: ["https://stroycontrol-api.cloudplus.uz/api/uploads/photo-1"],
            geoLat: 41.3111,
            geoLng: 69.2797
        )
        let encoded = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(CloseTaskRequest.self, from: encoded)
        XCTAssertEqual(decoded, request)
        XCTAssertEqual(decoded.photoUrls.count, 1)
    }

    func testRefreshKeepsUserWhenTokensRotate() throws {
        let user = AuthUser(
            id: "1", companyId: "2", companyName: "CloudPlus", email: "444",
            fullName: "Руководитель проекта", locale: "ru", roles: [Role(code: "pm", objectId: nil)]
        )
        let current = Session(accessToken: "old", refreshToken: "old-refresh", expiresIn: 900, user: user)
        let json = #"{"accessToken":"new","refreshToken":"new-refresh","expiresIn":900}"#.data(using: .utf8)!
        let tokens = try JSONDecoder().decode(RefreshResponse.self, from: json)
        let updated = Session(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn, user: current.user)
        XCTAssertEqual(updated.user?.roles.first?.code, "pm")
        XCTAssertEqual(updated.accessToken, "new")
    }
}
