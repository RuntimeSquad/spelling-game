import Foundation
import Security

struct OnlineChallenge: Decodable, Identifiable {
  var id: String
  var kind: String
  var closesAt: Double
  var closeDate: Date { Date(timeIntervalSince1970: closesAt / 1000) }
}
struct OnlineAttempt: Decodable {
  var id: String
  var status: String
  var position: Int
  var displayName: String
}
struct AnswerReview: Decodable, Identifiable {
  var word: String
  var definition: String
  var note: String
  var submitted: String?
  var correct: Bool
  var id: String { word }
}
struct OnlineResults: Decodable {
  var score: Int
  var total: Int
  var partial: Bool
  var items: [AnswerReview]
}
struct OnlineState: Decodable {
  var challenge: OnlineChallenge
  var attempt: OnlineAttempt?
  var results: OnlineResults?
}
struct OnlinePrompt: Decodable {
  var position: Int
  var audioUrl: URL
  var definition: String
}
struct Standing: Decodable, Identifiable {
  var rank: Int
  var displayName: String
  var score: Int
  var id: String { "\(rank)-\(displayName)" }
}
struct Standings: Decodable {
  var closed: Bool
  var rows: [Standing]
}
struct Hive: Decodable {
  var code: String
  var name: String
  var week: String
  var total: Int
  var goal: Int
  var resetsAt: Double
}
struct HiveResponse: Decodable { var team: Hive? }
struct EmptyResponse: Decodable {}
struct RemoteError: LocalizedError {
  var message: String
  var errorDescription: String? { message }
}

@MainActor final class OnlineGame: ObservableObject {
  @Published var enabled = false
  @Published var state: OnlineState?
  @Published var prompt: OnlinePrompt?
  @Published var standings: Standings?
  @Published var hive: Hive?
  @Published var busy = false
  @Published var error: String?
  @Published var answer = ""
  @Published var nickname = "Garden Bee"
  private var session: [String: String]?
  private var requestID = UUID().uuidString
  private var inFlight: Task<Void, Never>?
  static let keychainKey = "com.spellbee.native.simulator-session"
  func disconnect() {
    enabled = false
    state = nil
    prompt = nil
    hive = nil
    standings = nil
    answer = ""
  }
  private func endpoint(_ name: String) throws -> URL {
    guard enabled else {
      throw RemoteError(message: "Online play is available only in the 13+ experience.")
    }
    #if DEBUG && targetEnvironment(simulator)
      return URL(string: "http://127.0.0.1:5001/demo-spell-bee/us-central1/\(name)")!
    #else
      throw RemoteError(
        message:
          "Online release configuration is not connected yet. Adventure and private daily play are available offline."
      )
    #endif
  }
  private func json(_ url: URL, payload: [String: Any], token: String? = nil) async throws -> (
    Data, HTTPURLResponse
  ) {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    request.httpBody = try JSONSerialization.data(withJSONObject: payload)
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw RemoteError(message: "The game server did not respond.")
    }
    return (data, response)
  }
  private func authenticate() async throws -> String {
    _ = try endpoint("getDailyChallenge")
    if session == nil { session = Self.readSession() }
    if let session, let token = session["idToken"], let expiry = Double(session["expiresAt"] ?? ""),
      expiry > Date().timeIntervalSince1970 + 60
    {
      return token
    }
    let data: Data
    let status: Int
    if let refresh = session?["refreshToken"] {
      var request = URLRequest(
        url: URL(string: "http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=demo-only")!
      )
      request.httpMethod = "POST"
      request.timeoutInterval = 20
      request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
      request.httpBody =
        "grant_type=refresh_token&refresh_token=\(refresh.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)"
        .data(using: .utf8)
      let (d, r) = try await URLSession.shared.data(for: request)
      data = d
      status = (r as? HTTPURLResponse)?.statusCode ?? 500
    } else {
      let result = try await json(
        URL(
          string:
            "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only")!,
        payload: ["returnSecureToken": true])
      data = result.0
      status = result.1.statusCode
    }
    guard status == 200,
      let response = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let token = (response["idToken"] ?? response["id_token"]) as? String,
      let refresh = (response["refreshToken"] ?? response["refresh_token"]) as? String
    else {
      throw RemoteError(
        message: "Could not reconnect to the local game account. Adventure still works offline.")
    }
    session = [
      "idToken": token, "refreshToken": refresh,
      "expiresAt": String(Date().timeIntervalSince1970 + 3500),
    ]
    Self.writeSession(session!)
    return token
  }
  func call<T: Decodable>(_ name: String, _ payload: [String: Any] = [:]) async throws -> T {
    let endpoint = try endpoint(name)
    let token = try await authenticate()
    guard enabled else { throw CancellationError() }
    let (data, response) = try await json(endpoint, payload: ["data": payload], token: token)
    guard enabled else { throw CancellationError() }
    let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    if let error = root?["error"] as? [String: Any] {
      throw RemoteError(
        message: error["message"] as? String ?? "The request could not be completed.")
    }
    guard response.statusCode == 200, let result = root?["result"] ?? root?["data"] else {
      throw RemoteError(message: "Could not load online play. Check the local game server.")
    }
    return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: result))
  }
  func perform(_ operation: @escaping () async throws -> Void) async {
    guard !busy else { return }
    busy = true
    error = nil
    defer { busy = false }
    do { try await operation() } catch is CancellationError {} catch {
      self.error = error.localizedDescription
    }
  }
  func accept(_ next: OnlineState) async throws {
    state = next
    prompt = nil
    standings = nil
    answer =
      UserDefaults.standard.string(
        forKey: "draft-\(next.attempt?.id ?? "")-\(next.attempt?.position ?? 0)") ?? ""
    if next.attempt?.status == "active" {
      prompt = try await call("getPrompt", ["challengeId": next.challenge.id])
    } else if next.attempt != nil {
      standings = try await call("getStandings", ["challengeId": next.challenge.id])
    }
  }
  func openDaily() async {
    await perform {
      let state: OnlineState = try await self.call("getDailyChallenge")
      try await self.accept(state)
    }
  }
  func createFriend() async -> URL? {
    var invitation: URL?
    await perform {
      let state: OnlineState = try await self.call(
        "createPrivateChallenge", ["requestId": self.requestID])
      self.requestID = UUID().uuidString
      try await self.accept(state)
      invitation = URL(string: "spellbee://challenge/\(state.challenge.id)")
    }
    return invitation
  }
  func join(_ code: String) async {
    await perform {
      let cleaned =
        URL(string: code)?.path.split(separator: "/").last.map(String.init)
        ?? code.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !cleaned.isEmpty,
        cleaned.range(of: "^[a-zA-Z0-9_-]{1,100}$", options: .regularExpression) != nil
      else { throw RemoteError(message: "Enter a challenge code or invitation link.") }
      let state: OnlineState = try await self.call("getChallenge", ["challengeId": cleaned])
      try await self.accept(state)
    }
  }
  func start() async {
    guard let state else { return }
    await perform {
      let next: OnlineState = try await self.call(
        "startAttempt", ["challengeId": state.challenge.id, "displayName": self.nickname])
      try await self.accept(next)
    }
  }
  func submit() async {
    guard let state, let attempt = state.attempt,
      !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    await perform {
      let next: OnlineState = try await self.call(
        "submitAnswer",
        ["challengeId": state.challenge.id, "position": attempt.position, "answer": self.answer])
      UserDefaults.standard.removeObject(forKey: "draft-\(attempt.id)-\(attempt.position)")
      try await self.accept(next)
    }
  }
  func setDraft(_ answer: String) {
    self.answer = String(answer.prefix(100))
    if let attempt = state?.attempt {
      UserDefaults.standard.set(self.answer, forKey: "draft-\(attempt.id)-\(attempt.position)")
    }
  }
  func refresh() async {
    guard let state else { return }
    await perform {
      let next: OnlineState = try await self.call(
        "getChallenge", ["challengeId": state.challenge.id])
      try await self.accept(next)
    }
  }
  func team(_ action: String = "get", code: String = "") async {
    await perform {
      let response: HiveResponse = try await self.call(
        "adventureTeam", ["action": action, "code": code, "name": self.nickname + " Hive"])
      self.hive = response.team
    }
  }
  func contribute(level: Int, answers: [String]) async throws {
    let response: HiveResponse = try await call(
      "contributeAdventure", ["level": level, "answers": answers])
    hive = response.team
  }
  static func readSession() -> [String: String]? {
    var result: CFTypeRef?
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: keychainKey,
      kSecReturnData as String: true,
    ]
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode([String: String].self, from: data)
  }
  static func writeSession(_ session: [String: String]) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: keychainKey,
    ]
    SecItemDelete(query as CFDictionary)
    var record = query
    record[kSecValueData as String] = try? JSONEncoder().encode(session)
    record[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(record as CFDictionary, nil)
  }
}
