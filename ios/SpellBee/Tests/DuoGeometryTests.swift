import CoreGraphics
import XCTest

@testable import SpellBeeCore

final class DuoGeometryTests: XCTestCase {
  func testCompactKeepsAllContentInOnePane() {
    let plan = GardenPanePlan.make(size: CGSize(width: 360, height: 700), wantsSecondary: true)
    XCTAssertEqual(plan.primary, CGRect(x: 0, y: 0, width: 360, height: 700))
    XCTAssertNil(plan.secondary)
  }
  func testExpandedPanesStayInsideWindowAndDoNotOverlap() {
    let plan = GardenPanePlan.make(size: CGSize(width: 960, height: 700), wantsSecondary: true)
    XCTAssertNotNil(plan.secondary)
    XCTAssertFalse(plan.primary.intersects(plan.secondary!))
    XCTAssertEqual(plan.secondary!.maxX, 960)
    XCTAssertEqual(plan.primary.minX, 0)
  }
  func testBookFoldSplitsWithoutPlacingContentOnHinge() {
    let fold = CGRect(x: 380, y: 0, width: 40, height: 700)
    let plan = GardenPanePlan.make(
      size: CGSize(width: 800, height: 700), division: fold, wantsSecondary: true)
    XCTAssertEqual(plan.primary.maxX, fold.minX)
    XCTAssertEqual(plan.secondary?.minX, fold.maxX)
    XCTAssertFalse(plan.primary.intersects(fold))
    XCTAssertFalse(plan.secondary!.intersects(fold))
  }
  func testLaptopFoldStacksIndependentPanes() {
    let fold = CGRect(x: 0, y: 330, width: 800, height: 40)
    let plan = GardenPanePlan.make(
      size: CGSize(width: 800, height: 700), division: fold, wantsSecondary: true)
    XCTAssertEqual(plan.primary.maxY, fold.minY)
    XCTAssertEqual(plan.secondary?.minY, fold.maxY)
  }
  func testSingleFormStaysOnOneSideWhenFolded() {
    let fold = CGRect(x: 0, y: 310, width: 800, height: 40)
    let plan = GardenPanePlan.make(size: CGSize(width: 800, height: 700), division: fold)
    XCTAssertNil(plan.secondary)
    XCTAssertFalse(plan.primary.intersects(fold))
    XCTAssertEqual(plan.primary.minY, 350)
  }
  func testCameraOcclusionAndFoldShareWindowCoordinates() {
    let camera = CGRect(x: 740, y: 0, width: 60, height: 100)
    let fold = CGRect(x: 380, y: 0, width: 40, height: 700)
    let plan = GardenPanePlan.make(
      size: CGSize(width: 800, height: 700), division: fold, occlusions: [camera],
      wantsSecondary: true)
    XCTAssertFalse(plan.primary.intersects(camera))
    XCTAssertFalse(plan.secondary!.intersects(camera))
    XCTAssertFalse(plan.secondary!.intersects(fold))
  }
  func testLargeTextDoesNotForceSidebarInFlatWindow() {
    let plan = GardenPanePlan.make(
      size: CGSize(width: 800, height: 700), wantsSecondary: true, largeText: true)
    XCTAssertNil(plan.secondary)
    XCTAssertEqual(plan.primary.width, 800)
  }
  func testKeyboardResizeAndOffscreenRegionDoNotMakeNegativeFrames() {
    let plan = GardenPanePlan.make(
      size: CGSize(width: 350, height: 220), division: CGRect(x: 0, y: 300, width: 700, height: 30),
      occlusions: [CGRect(x: -20, y: -20, width: 50, height: 40)], wantsSecondary: true)
    XCTAssertNil(plan.secondary)
    XCTAssertGreaterThan(plan.primary.width, 0)
    XCTAssertGreaterThan(plan.primary.height, 0)
    XCTAssertGreaterThanOrEqual(plan.primary.minX, 0)
    XCTAssertGreaterThanOrEqual(plan.primary.minY, 0)
  }
}
