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
}
