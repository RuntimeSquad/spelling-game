import XCTest

@testable import SpellBeeCore

final class GameCoreTests: XCTestCase {
  func testPerfectRoundAndReplayRewards() {
    var save = AdventureSave()
    XCTAssertFalse(save.unlocked(2))
    XCTAssertEqual(save.finish(level: 1, score: 4), 30)
    XCTAssertEqual(save.stars, 4)
    XCTAssertTrue(save.unlocked(2))
    XCTAssertEqual(save.finish(level: 1, score: 5), 5)
    XCTAssertEqual(save.finish(level: 1, score: 2), 0)
    XCTAssertEqual(save.honey, 35)
    XCTAssertEqual(save.stars, 5)
  }
  func testZeroStarsStillUnlockNextLevel() {
    var save = AdventureSave()
    XCTAssertEqual(save.finish(level: 1, score: 0), 10)
    XCTAssertEqual(save.stars, 0)
    XCTAssertTrue(save.unlocked(2))
    XCTAssertEqual(save.finish(level: 3, score: 5), 0)
  }
  func testBoosterAndChestBoundaries() {
    var save = AdventureSave()
    for booster in Booster.allCases { XCTAssertFalse(save.spend(booster)) }
    XCTAssertNil(save.openChest(roll: 0))
    save.honey = 100
    let prize = save.openChest(roll: 0)
    XCTAssertEqual(prize?.booster, .slow)
    XCTAssertTrue(save.spend(.slow))
    XCTAssertTrue(save.spend(.slow))
    XCTAssertFalse(save.spend(.slow))
    XCTAssertNil(save.openChest(roll: 0))
    XCTAssertEqual(save.opened, 1)
  }
  func testCosmeticsNeverDuplicate() {
    var save = AdventureSave()
    save.honey = 420
    for _ in 0..<4 { XCTAssertNotNil(save.openChest(roll: 3)) }
    XCTAssertEqual(Set(save.accessories).count, 4)
    XCTAssertNil(save.openChest(roll: 0))
  }
  func testPrivateDailyStableAndFiveUniqueWords() {
    let words = (0..<60).map {
      SpellingWord(word: "word\($0)", definition: "definition", hint: "hint")
    }
    let a = GameRules.dailyWords(words, day: "2026-11-21")
    XCTAssertEqual(a, GameRules.dailyWords(words, day: "2026-11-21"))
    XCTAssertEqual(Set(a.map(\.word)).count, 5)
    XCTAssertNotEqual(a, GameRules.dailyWords(words, day: "2026-11-22"))
  }
  func testScoringNormalizationAndRoundTrip() throws {
    XCTAssertTrue(GameRules.correct("  GARDEN ", "garden"))
    XCTAssertFalse(GameRules.correct("garden!", "garden"))
    let save = AdventureSave()
    XCTAssertTrue(
      try JSONDecoder().decode(AdventureSave.self, from: JSONEncoder().encode(save)).validated())
    var bad = save
    bad.boosters["hint"] = -1
    XCTAssertFalse(bad.validated())
  }
  func testInvalidScoresDoNotChangeProgress() {
    var save = AdventureSave()
    XCTAssertEqual(save.finish(level: 1, score: 6), 0)
    XCTAssertEqual(save.finish(level: 0, score: 5), 0)
    XCTAssertEqual(save.honey, 0)
    XCTAssertEqual(save.stars, 0)
  }
}
