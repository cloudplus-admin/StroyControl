import Foundation
import Observation
import StoreKit

@MainActor
@Observable
final class StoreManager {
    private(set) var products: [Product] = []
    private(set) var activeProductIDs: Set<String> = []
    private(set) var isLoading = false
    private(set) var message = ""
    nonisolated(unsafe) private var updatesTask: Task<Void, Never>?

    static let productIDs = [
        "uz.cloudplus.stroycontrol.one_time_job",
        "uz.cloudplus.stroycontrol.renovation_monthly",
        "uz.cloudplus.stroycontrol.houses_monthly",
        "uz.cloudplus.stroycontrol.commercial_monthly"
    ]

    init() {
        updatesTask = observeTransactions()
    }

    deinit { updatesTask?.cancel() }

    func prepare() async {
        await loadProducts()
        await refreshEntitlements()
    }

    func product(id: String) -> Product? {
        products.first { $0.id == id }
    }

    func purchase(productID: String, session: Session) async -> Bool {
        guard let product = product(id: productID) else {
            message = L10n.text("Оплата пока недоступна. Тариф не настроен в App Store.")
            return false
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try verified(verification)
                try await APIClient.shared.verifyPurchase(productID: transaction.productID, transactionID: transaction.id, session: session)
                await transaction.finish()
                await refreshEntitlements()
                message = L10n.text("Оплата прошла успешно")
                return true
            case .pending:
                message = L10n.text("Оплата ожидает подтверждения")
            case .userCancelled:
                message = ""
            @unknown default:
                message = L10n.text("Не удалось завершить оплату")
            }
        } catch {
            message = L10n.text("Не удалось завершить оплату")
        }
        return false
    }

    func restore(session: Session) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await AppStore.sync()
            for await result in Transaction.currentEntitlements {
                guard let transaction = try? verified(result), transaction.revocationDate == nil else { continue }
                try await APIClient.shared.verifyPurchase(productID: transaction.productID, transactionID: transaction.id, session: session)
            }
            await refreshEntitlements()
            message = L10n.text("Покупки восстановлены")
        } catch {
            message = L10n.text("Не удалось восстановить покупки")
        }
    }

    func syncServer(session: Session) async {
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? verified(result), transaction.revocationDate == nil else { continue }
            try? await APIClient.shared.verifyPurchase(productID: transaction.productID, transactionID: transaction.id, session: session)
        }
    }

    private func loadProducts() async {
        do {
            products = try await Product.products(for: Self.productIDs).sorted {
                let left = Self.productIDs.firstIndex(of: $0.id) ?? Self.productIDs.count
                let right = Self.productIDs.firstIndex(of: $1.id) ?? Self.productIDs.count
                return left < right
            }
        } catch {
            products = []
            message = L10n.text("Не удалось загрузить тарифы из App Store")
        }
    }

    private func refreshEntitlements() async {
        var active: Set<String> = []
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? verified(result), transaction.revocationDate == nil else { continue }
            active.insert(transaction.productID)
        }
        activeProductIDs = active
    }

    private func observeTransactions() -> Task<Void, Never> {
        Task { [weak self] in
            for await result in Transaction.updates {
                guard let self, let transaction = try? self.verified(result) else { continue }
                await transaction.finish()
                await self.refreshEntitlements()
            }
        }
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value): value
        case .unverified: throw StoreError.failedVerification
        }
    }
}

private enum StoreError: Error {
    case failedVerification
}
