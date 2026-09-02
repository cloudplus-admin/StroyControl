import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var error = ""
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Логин", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    SecureField("Пароль", text: $password)
                }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                Button(isLoading ? "Входим..." : "Войти") { Task { await login() } }
                    .disabled(isLoading || email.isEmpty || password.isEmpty)
            }
            .scrollBounceBehavior(.always)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Астрой")
        }
    }

    private func login() async {
        isLoading = true
        defer { isLoading = false }
        do { try await session.login(email: email.trimmingCharacters(in: .whitespaces), password: password) }
        catch { self.error = error.localizedDescription }
    }
}
