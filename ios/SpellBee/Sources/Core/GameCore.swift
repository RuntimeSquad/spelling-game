import Foundation

struct SpellingWord: Codable, Identifiable, Equatable {
  var word: String
  var definition: String
  var hint: String
  var id: String { word }
}
struct AdventureLevel: Codable, Identifiable {
  var id: Int
  var world: String
  var words: [SpellingWord]
}
enum Booster: String, Codable, CaseIterable, Identifiable {
  case slow, letter, hint
  var id: String { rawValue }
  var title: String {
    switch self {
    case .slow: "Slow replays"
    case .letter: "Letter reveals"
    case .hint: "Spelling hints"
    }
  }
  var icon: String {
    switch self {
    case .slow: "tortoise.fill"
    case .letter: "a.square.fill"
    case .hint: "lightbulb.fill"
    }
  }
}
struct ChestPrize: Codable, Equatable {
  var booster: Booster?
  var accessory: Int?
  var label: String
}
struct LocalRound: Codable, Identifiable {
  var id = UUID().uuidString
  var level: Int?
  var day: String?
  var words: [SpellingWord]
  var answers: [String] = []
  var draft = ""
  var locked = false
  var used: [String] = []
  var position: Int { answers.count }
  var finished: Bool { answers.count == words.count }
  var current: SpellingWord? { finished ? nil : words[position] }
  var correct: Bool { current.map { GameRules.correct(draft, $0.word) } ?? false }
  var score: Int { zip(answers, words).filter { GameRules.correct($0.0, $0.1.word) }.count }
}
struct AdventureSave: Codable, Equatable {
  var version = 1
  var best: [Int: Int] = [:]
  var honey = 0
  var opened = 0
  var boosters: [String: Int] = [:]
  var accessories: [Int] = []
  var wearing = 0
  var stars: Int { best.values.reduce(0, +) }
  var nextChest: Int { min(100, max(0, honey - opened * 100)) }
  var canOpen: Bool { opened < 4 && honey >= (opened + 1) * 100 }
  func unlocked(_ level: Int) -> Bool { level == 1 || best[level - 1] != nil }
  @discardableResult mutating func finish(level: Int, score: Int) -> Int {
    guard (1...12).contains(level), (0...5).contains(score), unlocked(level) else { return 0 }
    let old = best[level]
    let earned = (old == nil ? 10 : 0) + max(0, score - (old ?? 0)) * 5
    best[level] = max(old ?? 0, score)
    honey += earned
    return earned
  }
  mutating func spend(_ booster: Booster) -> Bool {
    guard boosters[booster.rawValue, default: 0] > 0 else { return false }
    boosters[booster.rawValue, default: 0] -= 1
    return true
  }
  mutating func openChest(roll: Int) -> ChestPrize? {
    guard canOpen else { return nil }
    var prizes = Booster.allCases.map {
      ChestPrize(booster: $0, label: "2 \($0.title.lowercased())")
    }
    for index in 1...4 where !accessories.contains(index) {
      prizes.append(ChestPrize(accessory: index, label: GameRules.outfits[index]))
    }
    let prize = prizes[max(0, roll) % prizes.count]
    if let booster = prize.booster { boosters[booster.rawValue, default: 0] += 2 }
    if let accessory = prize.accessory {
      accessories.append(accessory)
      wearing = accessory
    }
    opened += 1
    return prize
  }
  func validated() -> Bool {
    version == 1 && (0...420).contains(honey) && (0...4).contains(opened)
      && best.allSatisfy { (1...12).contains($0.key) && (0...5).contains($0.value) }
      && boosters.allSatisfy { Booster(rawValue: $0.key) != nil && (0...8).contains($0.value) }
      && accessories.allSatisfy { (1...4).contains($0) }
      && (wearing == 0 || accessories.contains(wearing))
  }
}
enum GameRules {
  static let outfits = ["Classic bee", "Daisy crown", "Honey bow", "Sparkle wings", "Garden crown"]
  static let outfitIcons = ["", "🌼", "🎀", "✨", "👑"]
  static let messages = [
    "Let’s give those words another try.", "One word down. Keep practicing!",
    "Two words right. Keep practicing!", "Three words right. Nice work!", "Fantastic four!",
    "A royal five!",
  ]
  static func correct(_ answer: String, _ word: String) -> Bool {
    answer.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == word.lowercased()
  }
  static func day(_ date: Date = Date()) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }
  static func dailyWords(_ words: [SpellingWord], day: String) -> [SpellingWord] {
    var seed = day.utf8.reduce(UInt64(5381)) { ($0 &* 33) &+ UInt64($1) }
    var pool = words
    for index in pool.indices.reversed() where index > 0 {
      seed = seed &* 6_364_136_223_846_793_005 &+ 1
      pool.swapAt(index, Int(seed % UInt64(index + 1)))
    }
    return Array(pool.prefix(5))
  }
}
