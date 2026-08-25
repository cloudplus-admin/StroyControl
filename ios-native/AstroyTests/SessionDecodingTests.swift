import XCTest
@testable import Astroy

final class SessionDecodingTests: XCTestCase {
    func testDecodesProductionLoginShape() throws {
        let json = #"{"accessToken":"a","refreshToken":"r","expiresIn":900,"user":{"id":"1","companyId":"2","companyName":"CloudPlus","email":"user@example.com","fullName":"User","locale":"ru","roles":[{"code":"FOREMAN","objectId":null}]}}"#.data(using: .utf8)!
        let session = try JSONDecoder().decode(Session.self, from: json)
        XCTAssertEqual(session.user?.roles.first?.code, "FOREMAN")
    }
}
