import SwiftUI

enum Garden {
  static let ink = Color(red: 0.13, green: 0.25, blue: 0.19)
  static let paper = Color(red: 0.98, green: 0.97, blue: 0.93)
  static let green = Color(red: 0.27, green: 0.44, blue: 0.29)
  static let honey = Color(red: 0.94, green: 0.69, blue: 0.25)
  static let meadow = Color(red: 0.91, green: 0.95, blue: 0.85)
  static let lilac = Color(red: 0.93, green: 0.90, blue: 0.98)
}
struct GardenButton: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled
  var secondary = false
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.system(.headline, design: .rounded)).frame(maxWidth: .infinity)
      .padding(.vertical, 16).padding(.horizontal, 18).foregroundStyle(
        secondary ? Garden.ink : .white
      ).background(secondary ? Garden.meadow : Garden.green, in: RoundedRectangle(cornerRadius: 18))
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .opacity(isEnabled ? 1 : 0.45)
  }
}
struct GardenCard<Content: View>: View {
  var color: Color = .white
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 18) { content }.padding(22).frame(
      maxWidth: .infinity, alignment: .leading
    ).background(color, in: RoundedRectangle(cornerRadius: 26)).overlay(
      RoundedRectangle(cornerRadius: 26).stroke(Garden.green.opacity(0.12), lineWidth: 1))
  }
}
struct WordDefinitionView: View {
  let definition: String
  var body: some View {
    VStack(spacing: 8) {
      Text("WORD MEANING").font(.caption.bold()).tracking(1)
      Text(definition).font(.system(.title2, design: .rounded, weight: .bold))
        .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(Garden.ink)
    .padding(20).frame(maxWidth: .infinity)
    .background(Garden.honey.opacity(0.16), in: RoundedRectangle(cornerRadius: 20))
    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Garden.honey, lineWidth: 2))
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("word-definition")
  }
}
struct BeeView: View {
  var accessory = 0
  var size: CGFloat = 100
  var body: some View {
    ZStack {
      Ellipse().fill(.white.opacity(0.85)).frame(width: size * 0.36, height: size * 0.55)
        .rotationEffect(.degrees(-35)).offset(x: -size * 0.17, y: -size * 0.22)
      Ellipse().fill(.white.opacity(0.85)).frame(width: size * 0.36, height: size * 0.55)
        .rotationEffect(.degrees(35)).offset(x: size * 0.17, y: -size * 0.22)
      ZStack {
        Ellipse().fill(Garden.honey)
        HStack(spacing: size * 0.12) {
          Rectangle().fill(Garden.ink)
          Rectangle().fill(Garden.ink)
        }.padding(.horizontal, size * 0.19)
      }.frame(width: size * 0.78, height: size * 0.54).clipShape(Ellipse()).rotationEffect(
        .degrees(-12))
      HStack(spacing: size * 0.1) {
        Circle().fill(Garden.ink)
        Circle().fill(Garden.ink)
      }.frame(width: size * 0.2, height: size * 0.05).offset(x: size * 0.2, y: -size * 0.06)
      if accessory > 0 {
        Text(GameRules.outfitIcons[accessory]).font(.system(size: size * 0.32)).offset(
          y: -size * 0.43)
      }
    }.frame(width: size, height: size).accessibilityLabel(GameRules.outfits[accessory])
  }
}
struct Stars: View {
  var score: Int
  var large = false
  var body: some View {
    ViewThatFits(in: .horizontal) {
      row(size: large ? 32 : 14, spacing: large ? 8 : 3)
      row(size: large ? 22 : 12, spacing: 4)
      row(size: 14, spacing: 2)
    }.frame(maxWidth: .infinity)
      .accessibilityElement(children: .ignore).accessibilityLabel("\(score) out of 5 stars")
  }
  private func row(size: CGFloat, spacing: CGFloat) -> some View {
    HStack(spacing: spacing) {
      ForEach(0..<5) { index in
        Image(systemName: index < score ? "star.fill" : "star").foregroundStyle(
          index < score ? Garden.honey : Garden.ink.opacity(0.25))
      }
    }.font(.system(size: size, weight: .bold)).fixedSize()
  }
}
struct VictoryView: View {
  var score: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var dancing = false
  @State private var active = true
  var body: some View {
    VStack(spacing: 14) {
      if score >= 4 {
        BeeView(accessory: score == 5 ? 4 : 0, size: score == 5 ? 140 : 100).rotationEffect(
          .degrees(dancing && !reduceMotion ? 10 : -5)
        ).offset(y: dancing && !reduceMotion ? -12 : 0)
      }
      Text(GameRules.messages[score]).font(.system(.title, design: .rounded, weight: .bold))
        .multilineTextAlignment(.center)
      Stars(score: score, large: true).scaleEffect(dancing && !reduceMotion && active ? 1.06 : 1)
      if score >= 4 && active {
        Button("Finish celebration") {
          active = false
          dancing = false
        }.font(.footnote).padding(8)
      }
    }.frame(maxWidth: .infinity).padding(.vertical, 16).overlay {
      if active && score >= 4 && !reduceMotion {
        TimelineView(.animation) { context in
          Canvas { graphics, size in
            let t = context.date.timeIntervalSinceReferenceDate
            for i in 0..<(score == 5 ? 80 : 24) {
              let x = CGFloat((i * 37) % 100) / 100 * size.width
              let y =
                CGFloat(
                  (t * Double(60 + i % 5 * 12) + Double(i * 41)).truncatingRemainder(
                    dividingBy: Double(size.height + 20))) - 10
              let rect = CGRect(x: x, y: y, width: score == 5 ? 7 : 5, height: 10)
              graphics.fill(
                Path(roundedRect: rect, cornerRadius: 2),
                with: .color([Garden.honey, Garden.green, .pink, .purple][i % 4]))
            }
          }
        }.allowsHitTesting(false).accessibilityHidden(true)
      }
    }.task {
      guard score >= 4 else { return }
      if !reduceMotion {
        withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
          dancing = true
        }
      }
      try? await Task.sleep(for: .seconds(score == 5 ? 7 : 4))
      active = false
      dancing = false
    }
  }
}
