import SwiftUI

extension GardenPanePlan {
  static func read(_ proxy: GeometryProxy, wantsSecondary: Bool = false, largeText: Bool = false)
    -> GardenPanePlan
  {
    if #available(iOS 27.1, *) {
      return make(
        size: proxy.size,
        division: proxy.reservedRegions(kind: .division, layoutDirectionBehavior: .fixed).first?
          .frame,
        occlusions: proxy.reservedRegions(kind: .occlusion, layoutDirectionBehavior: .fixed).map(
          \.frame),
        wantsSecondary: wantsSecondary, largeText: largeText)
    }
    return make(size: proxy.size, wantsSecondary: wantsSecondary, largeText: largeText)
  }
}

/// Keep a form within one usable pane when a fold divides the display.
/// Moving its frame preserves the ScrollView and its focused field identities.
struct DuoScrollView<Content: View>: View {
  var maximumWidth: CGFloat = 650
  var resizeAnchor: String? = nil
  @ViewBuilder var content: Content
  var body: some View {
    GeometryReader { proxy in
      let pane = GardenPanePlan.read(proxy).primary
      ScrollViewReader { scroll in
        ScrollView {
          content.frame(maxWidth: maximumWidth).frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: pane) { _, _ in
          if let resizeAnchor {
            withAnimation(.easeOut(duration: 0.2)) {
              scroll.scrollTo(resizeAnchor, anchor: .bottom)
            }
          }
        }
        .frame(width: pane.width, height: pane.height)
        .position(x: pane.midX, y: pane.midY)
        .accessibilityIdentifier("duo-primary-pane")
      }
    }.background(Garden.paper)
  }
}

/// Independent scrolling panes in expanded/book/laptop poses. Compact screens
/// retain every reward control in the primary scroll instead of hiding it.
struct DuoGardenLayout<Primary: View, Secondary: View>: View {
  var primaryScrollTarget: String? = nil
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var typeSize
  @ViewBuilder var primary: Primary
  @ViewBuilder var secondary: Secondary
  var body: some View {
    GeometryReader { proxy in
      let plan = GardenPanePlan.read(
        proxy, wantsSecondary: true, largeText: typeSize.isAccessibilitySize)
      let sidebar = plan.secondary ?? .zero
      ZStack(alignment: .topLeading) {
        ScrollViewReader { scroll in
          ScrollView {
            VStack(alignment: .leading, spacing: 24) {
              primary
              if plan.secondary == nil { secondary }
            }.padding(20).frame(maxWidth: 760).frame(maxWidth: .infinity)
          }.frame(width: plan.primary.width, height: plan.primary.height)
            .position(x: plan.primary.midX, y: plan.primary.midY)
            .accessibilityIdentifier("duo-primary-pane")
          .onAppear {
            if let primaryScrollTarget { scroll.scrollTo(primaryScrollTarget, anchor: .center) }
          }
          .onChange(of: primaryScrollTarget) { _, target in
            if let target {
              withAnimation(reduceMotion ? nil : .easeInOut(duration: 1.1)) {
                scroll.scrollTo(target, anchor: .center)
              }
            }
          }
        }
        ScrollView { secondary.padding(20) }
          .frame(width: max(0, sidebar.width), height: max(0, sidebar.height))
          .position(x: sidebar.midX, y: sidebar.midY)
          .opacity(plan.secondary == nil ? 0 : 1)
          .allowsHitTesting(plan.secondary != nil)
          .accessibilityHidden(plan.secondary == nil)
          .accessibilityIdentifier("duo-secondary-pane")
      }
    }.background(Garden.paper)
  }
}
