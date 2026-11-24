import XCTest

final class SpellBeeUITests: XCTestCase {
  @MainActor func testAdventureRound() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-experience", "child"]
    app.launch()
    if app.buttons["Family play · under 13"].waitForExistence(timeout: 10) {
      app.buttons["Family play · under 13"].tap()
    }
    app.tabBars.buttons["Adventure"].tap()
    let level = app.buttons["level-1"]
    XCTAssertTrue(level.waitForExistence(timeout: 10))
    level.tap()
    for (index, answer) in ["sun", "bee", "leaf", "nest", "pond"].enumerated() {
      let input = app.textFields["spelling-answer"]
      XCTAssertTrue(input.waitForExistence(timeout: 10))
      input.tap()
      input.typeText(answer)
      app.buttons["lock-answer"].tap()
      let next = app.buttons["next-word"]
      XCTAssertTrue(next.waitForExistence(timeout: 5))
      next.tap()
      if index == 4 {
        XCTAssertTrue(app.staticTexts["round-score"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["round-score"].label.contains("5/5"))
      }
    }
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Perfect-five-native"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    app.buttons["Back to garden"].tap()
    let bee = app.otherElements["map-bee"]
    XCTAssertTrue(bee.waitForExistence(timeout: 5))
    XCTAssertEqual(bee.label, "Your bee is at level 2")
    XCTAssertTrue(app.buttons["level-1"].label.contains("Completed"))
    XCTAssertTrue(app.buttons["level-2"].label.contains("current level"))
    XCTAssertTrue(app.buttons["level-3"].label.contains("Up next"))
    let map = XCTAttachment(screenshot: app.screenshot())
    map.name = "Bee-arrived-level-two"
    map.lifetime = .keepAlways
    add(map)
    app.tabBars.buttons["Friends"].tap()
    XCTAssertTrue(app.staticTexts["A garden just for you."].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["invite-friends-now"].exists)
  }
}

extension SpellBeeUITests {
  @MainActor func testOnlineModes() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-experience", "older"]
    app.launch()
    app.tabBars.buttons["Daily"].tap()
    app.buttons["Play daily challenge"].tap()
    let start = app.buttons["Play these five words"]
    let input = app.textFields["online-answer"]
    if start.waitForExistence(timeout: 20) { start.tap() }
    XCTAssertTrue(input.waitForExistence(timeout: 20))
    app.tabBars.buttons["Friends"].tap()
    let create = app.buttons["invite-friends-now"]
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    create.tap()
    let closeShare = app.buttons["Close"]
    XCTAssertTrue(closeShare.waitForExistence(timeout: 20))
    closeShare.tap()
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Challenge code:")).firstMatch.waitForExistence(timeout: 5))
    if start.waitForExistence(timeout: 10) { start.tap() }
    XCTAssertTrue(input.waitForExistence(timeout: 20))
    app.tabBars.buttons["Teams"].tap()
    let hive = app.buttons["Create my hive"]
    if hive.waitForExistence(timeout: 10) {
      let enabled = NSPredicate(format: "enabled == true")
      expectation(for: enabled, evaluatedWith: hive)
      waitForExpectations(timeout: 10)
      hive.tap()
    }
    XCTAssertTrue(app.buttons["Refresh team"].waitForExistence(timeout: 20))
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Native-private-team"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }
}

extension SpellBeeUITests {
  @MainActor func testExpandedGardenLayout() throws {
    defer { XCUIDevice.shared.orientation = .portrait }
    let app = XCUIApplication()
    app.launchArguments = ["-experience", "child"]
    app.launch()
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertTrue(app.buttons["level-1"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Your booster collection"].exists)
    let sidebar = app.scrollViews["duo-secondary-pane"]
    XCTAssertTrue(sidebar.exists)
    let expanded = NSPredicate { _, _ in
      sidebar.frame.width > 240 && app.frame.width > app.frame.height
    }
    expectation(for: expanded, evaluatedWith: sidebar)
    waitForExpectations(timeout: 15)
    XCTAssertGreaterThan(sidebar.frame.width, 240)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Expanded-native-garden"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }
}

extension SpellBeeUITests {
  @MainActor func testDraftSurvivesRotation() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-experience", "child"]
    XCUIDevice.shared.orientation = .portrait
    app.launch()
    let level = app.buttons["level-1"]
    XCTAssertTrue(level.waitForExistence(timeout: 10))
    level.tap()
    let field = app.textFields["spelling-answer"]
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    field.tap()
    field.typeText("su")
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    XCTAssertEqual(field.value as? String, "su")
    XCUIDevice.shared.orientation = .portrait
    XCTAssertEqual(field.value as? String, "su")
    field.tap()
    field.typeText("n")
    app.buttons["lock-answer"].tap()
    XCTAssertTrue(app.staticTexts["Beautifully spelled! 🌟"].waitForExistence(timeout: 5))
    app.buttons["next-word"].tap()
    XCTAssertTrue(app.staticTexts["Word 2 of 5"].waitForExistence(timeout: 5))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "Round-after-resize"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
