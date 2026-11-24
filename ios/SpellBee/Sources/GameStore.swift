import LocalAuthentication
import SwiftUI

@MainActor final class GameStore: ObservableObject {
  @Published var save = AdventureSave()
  @Published var round: LocalRound?
  @Published var result: LocalRound?
  @Published var earned = 0
  @Published var prize: ChestPrize?
  @Published var error: String?
  @Published var role: String { didSet { UserDefaults.standard.set(role, forKey: "experience") } }
  @Published var sound = true
  @Published var presentingRound = false
  var levels: [AdventureLevel] = []
  let audio = GameAudio()
  private let file: URL
  private let roundFile: URL
  private var announced = Set<String>()
  var isChild: Bool { role != "older" }
  init() {
    role = UserDefaults.standard.string(forKey: "experience") ?? "unset"
    let root = URL.applicationSupportDirectory.appending(
      path: "SpellBee", directoryHint: .isDirectory)
    file = root.appending(path: "adventure.json")
    roundFile = root.appending(path: "round.json")
    do {
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      levels = try JSONDecoder().decode(
        [AdventureLevel].self,
        from: Data(contentsOf: Bundle.main.url(forResource: "adventure", withExtension: "json")!))
      if FileManager.default.fileExists(atPath: file.path) {
        save = try JSONDecoder().decode(AdventureSave.self, from: Data(contentsOf: file))
        guard save.validated() else { throw CocoaError(.fileReadCorruptFile) }
      }
      if let data = try? Data(contentsOf: roundFile) {
        round = try JSONDecoder().decode(LocalRound?.self, from: data)
      }
    } catch {
      self.error =
        "Your game couldn’t be loaded. Your saved file has been left intact. \(error.localizedDescription)"
    }
  }
  func persist() {
    do {
      try JSONEncoder().encode(save).write(to: file, options: .atomic)
      try JSONEncoder().encode(round).write(to: roundFile, options: .atomic)
    } catch { self.error = "Could not save progress. \(error.localizedDescription)" }
  }
  func start(_ level: AdventureLevel) {
    guard save.unlocked(level.id) else { return }
    presentingRound = true
    result = nil
    prize = nil
    audio.stop()
    round = LocalRound(level: level.id, words: level.words)
    persist()
  }
  func daily() {
    presentingRound = true
    let day = GameRules.day()
    let key = "private-daily-" + day
    if let data = UserDefaults.standard.data(forKey: key),
      let completed = try? JSONDecoder().decode(LocalRound.self, from: data)
    {
      result = completed
      round = nil
      return
    }
    result = nil
    audio.stop()
    round = LocalRound(day: day, words: GameRules.dailyWords(levels.flatMap(\.words), day: day))
    persist()
  }
  func draft(_ text: String) {
    round?.draft = String(text.prefix(100))
    persist()
  }
  func announce() {
    guard let round, let word = round.current, !round.locked else { return }
    let key = "\(round.id):\(round.position)"
    guard !announced.contains(key) else { return }
    announced.insert(key)
    audio.speak(word.word, enabled: sound)
  }
  func listen() { if let word = round?.current { audio.speak(word.word, enabled: sound) } }
  func lock() {
    guard let round, !round.locked,
      !round.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    audio.stop()
    self.round?.locked = true
    audio.cue(round.day == nil ? (round.correct ? .correct : .incorrect) : .correct, enabled: sound)
    persist()
    if round.day != nil { next() }
  }
  func next() {
    guard var active = round, active.locked else { return }
    active.answers.append(active.draft)
    active.draft = ""
    active.locked = false
    if active.finished {
      if let level = active.level { earned = save.finish(level: level, score: active.score) }
      if let day = active.day, let data = try? JSONEncoder().encode(active) {
        UserDefaults.standard.set(data, forKey: "private-daily-" + day)
      }
      result = active
      round = nil
      persist()
      audio.cue(active.score == 5 ? .perfect : active.score == 4 ? .four : .reward, enabled: sound)
    } else {
      round = active
      persist()
    }
  }
  func booster(_ kind: Booster) {
    guard let active = round, active.day == nil, !active.locked, let word = active.current else {
      return
    }
    let key = "\(kind.rawValue):\(active.position)"
    if kind != .slow && active.used.contains(key) { return }
    guard save.spend(kind) else { return }
    if kind == .slow {
      if !audio.speak(word.word, slow: true, enabled: sound) {
        save.boosters[kind.rawValue, default: 0] += 1
      }
    } else {
      round?.used.append(key)
    }
    persist()
  }
  func openChest() {
    guard save.canOpen else { return }
    prize = save.openChest(roll: Int.random(in: 0..<Int.max))
    persist()
    audio.cue(.reward, enabled: sound)
  }
  func leaveRound() {
    audio.stop()
    round = nil
    persist()
  }
  func restore(_ data: Data) throws {
    let restored = try JSONDecoder().decode(AdventureSave.self, from: data)
    guard restored.validated() else { throw CocoaError(.fileReadCorruptFile) }
    save = restored
    round = nil
    result = nil
    persist()
  }
  func authorizeParent() async -> Bool {
    let context = LAContext()
    do {
      return try await context.evaluatePolicy(
        .deviceOwnerAuthentication,
        localizedReason: "Open the parent area to manage Spell-Bee progress and settings.")
    } catch {
      self.error =
        "Use a device with a passcode to unlock parent controls. \(error.localizedDescription)"
      return false
    }
  }
}
