import Foundation

struct PendingTaskClosure: Codable, Identifiable, Equatable {
    let id: String
    let taskId: String
    let photoData: Data
    let latitude: Double
    let longitude: Double
    let createdAt: Date
}

actor OfflineQueue {
    static let shared = OfflineQueue()

    private let fileURL: URL
    private var closures: [PendingTaskClosure]

    init(fileURL: URL? = nil) {
        let resolvedURL = fileURL ?? Self.defaultFileURL()
        self.fileURL = resolvedURL
        closures = (try? Data(contentsOf: resolvedURL))
            .flatMap { try? JSONDecoder().decode([PendingTaskClosure].self, from: $0) } ?? []
    }

    func enqueue(_ closure: PendingTaskClosure) throws {
        if let index = closures.firstIndex(where: { $0.id == closure.id }) {
            closures[index] = closure
        } else {
            closures.append(closure)
        }
        try persist()
    }

    func all() -> [PendingTaskClosure] { closures }

    func count() -> Int { closures.count }

    func remove(id: String) throws {
        closures.removeAll { $0.id == id }
        try persist()
    }

    private func persist() throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try JSONEncoder().encode(closures)
        try data.write(to: fileURL, options: .atomic)
    }

    private static func defaultFileURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appending(path: "Astroy", directoryHint: .isDirectory)
            .appending(path: "offline-task-closures.json")
    }
}

