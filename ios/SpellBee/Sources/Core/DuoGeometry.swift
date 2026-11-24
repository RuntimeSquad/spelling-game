import CoreGraphics
import Foundation

/// Window-local geometry only: never device model, orientation, or UIScreen.main.
struct GardenPanePlan: Equatable {
  var primary: CGRect
  var secondary: CGRect?

  static func make(
    size: CGSize, division: CGRect? = nil, occlusions: [CGRect] = [],
    wantsSecondary: Bool = false, largeText: Bool = false
  ) -> GardenPanePlan {
    let bounds = CGRect(origin: .zero, size: size)
    guard size.width > 0, size.height > 0 else { return .init(primary: .zero) }
    let usable = avoidOcclusions(in: bounds, occlusions: occlusions)
    if let fold = division?.intersection(usable), !fold.isNull, !fold.isEmpty {
      let vertical = fold.height > fold.width
      let first =
        vertical
        ? CGRect(
          x: usable.minX, y: usable.minY, width: max(0, fold.minX - usable.minX),
          height: usable.height)
        : CGRect(
          x: usable.minX, y: usable.minY, width: usable.width,
          height: max(0, fold.minY - usable.minY))
      let second =
        vertical
        ? CGRect(
          x: fold.maxX, y: usable.minY, width: max(0, usable.maxX - fold.maxX),
          height: usable.height)
        : CGRect(
          x: usable.minX, y: fold.maxY, width: usable.width, height: max(0, usable.maxY - fold.maxY)
        )
      if wantsSecondary && first.width >= 240 && second.width >= 240 && first.height >= 140
        && second.height >= 140
      {
        return .init(primary: first, secondary: second)
      }
      return .init(
        primary: first.width * first.height >= second.width * second.height ? first : second)
    }
    if wantsSecondary && !largeText && usable.width >= 760 {
      let gap: CGFloat = 20
      let sidebar = min(360, usable.width * 0.38)
      return .init(
        primary: CGRect(
          x: usable.minX, y: usable.minY, width: usable.width - sidebar - gap, height: usable.height
        ),
        secondary: CGRect(
          x: usable.maxX - sidebar, y: usable.minY, width: sidebar, height: usable.height))
    }
    return .init(primary: usable)
  }

  private static func avoidOcclusions(in bounds: CGRect, occlusions: [CGRect]) -> CGRect {
    var usable = bounds
    for region in occlusions {
      let overlap = usable.intersection(region)
      guard !overlap.isNull, !overlap.isEmpty else { continue }
      let candidates = [
        CGRect(
          x: usable.minX, y: usable.minY, width: max(0, overlap.minX - usable.minX),
          height: usable.height),
        CGRect(
          x: overlap.maxX, y: usable.minY, width: max(0, usable.maxX - overlap.maxX),
          height: usable.height),
        CGRect(
          x: usable.minX, y: usable.minY, width: usable.width,
          height: max(0, overlap.minY - usable.minY)),
        CGRect(
          x: usable.minX, y: overlap.maxY, width: usable.width,
          height: max(0, usable.maxY - overlap.maxY)),
      ]
      usable = candidates.max(by: { $0.width * $0.height < $1.width * $1.height }) ?? usable
    }
    return usable
  }
}
