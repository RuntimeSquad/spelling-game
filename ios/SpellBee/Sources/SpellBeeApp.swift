import SwiftUI

@main struct SpellBeeApp: App {
  @StateObject private var store = GameStore()
  @StateObject private var online = OnlineGame()
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(store).environmentObject(online).tint(Garden.green)
        .preferredColorScheme(.light)
        .onChange(of: phase) { _, phase in
          if phase != .active {
            store.audio.stop()
            store.persist()
          }
        }
    }
  }
}
struct RootView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @State private var tab = 0
  var body: some View {
    Group {
      if store.role == "unset" {
        WelcomeView()
      } else {
        TabView(selection: $tab) {
          NavigationStack { AdventureMap() }.tabItem {
            Label("Adventure", systemImage: "leaf.fill")
          }.tag(0)
          NavigationStack { DailyView() }.tabItem { Label("Daily", systemImage: "sun.max.fill") }
            .tag(1)
          NavigationStack { FriendsView() }.tabItem {
            Label("Friends", systemImage: "person.2.fill")
          }.tag(2)
          NavigationStack { TeamsView() }.tabItem { Label("Teams", systemImage: "hexagon.fill") }
            .tag(3)
          NavigationStack { SettingsView() }.tabItem {
            Label("My bee", systemImage: "person.crop.circle")
          }.tag(4)
        }.onChange(of: tab) { _, _ in store.audio.stop() }
      }
    }
    .foregroundStyle(Garden.ink)
    .onChange(of: store.role) { _, role in
      if role == "older" { online.enabled = true } else { online.disconnect() }
    }
    .onAppear { online.enabled = !store.isChild }
    .fullScreenCover(isPresented: $store.presentingRound) {
      LocalPlayView().environmentObject(store).environmentObject(online)
    }
    .alert(
      "Spell-Bee",
      isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })
    ) {
      Button("OK") { store.error = nil }
    } message: {
      Text(store.error ?? "")
    }
    .onOpenURL { url in
      guard !store.isChild, url.scheme == "spellbee", url.host == "challenge",
        let code = url.pathComponents.last, code != "/"
      else { return }
      tab = 2
      Task { await online.join(code) }
    }
  }
}
struct WelcomeView: View {
  @EnvironmentObject var store: GameStore
  var body: some View {
    DuoScrollView(maximumWidth: 600) {
      VStack(alignment: .leading, spacing: 26) {
        HStack {
          Text("Spell-Bee.").font(.system(.title2, design: .serif, weight: .bold))
          Spacer()
          Text("🌼")
        }
        BeeView(size: 160).frame(maxWidth: .infinity).padding(.top, 25)
        Text("A little wordplay.\nA brighter day.").font(
          .system(.largeTitle, design: .serif, weight: .bold))
        Text("Listen, spell, and watch your garden grow.").font(.title3)
        GardenCard(color: Garden.meadow) {
          Text("Choose your experience").font(.title2.bold())
          Button("Family play · under 13") { store.role = "child" }.buttonStyle(GardenButton())
          Text(
            "Adventure and private daily words. No public profiles or social connections. A parent manages backups and settings."
          ).font(.subheadline)
          Button("I’m 13 or older") { store.role = "older" }.buttonStyle(
            GardenButton(secondary: true))
          Text(
            "Includes invitation-only friend challenges and private teams. No chat or stranger matchmaking."
          ).font(.subheadline)
        }
        Text("Free to play. No ads. No purchases.").font(.footnote).frame(maxWidth: .infinity)
      }.padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
    }.background(Garden.paper)
  }
}
struct AdventureMap: View {
  @EnvironmentObject var store: GameStore
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var beeLevel = 1
  @State private var placedBee = false
  private var currentLevel: Int {
    store.round?.level ?? store.levels.first(where: { store.save.best[$0.id] == nil })?.id
      ?? store.levels.last?.id ?? 1
  }
  private var gardenComplete: Bool { store.levels.allSatisfy { store.save.best[$0.id] != nil } }
  let worlds = [
    ("Flower Fields", "Find your wings.", Garden.meadow, "🌼"),
    ("Honey Hollow", "Follow the honey trail.", Color(red: 1, green: 0.94, blue: 0.81), "🍯"),
    ("Royal Gardens", "Let your confidence bloom.", Garden.lilac, "👑"),
  ]
  var body: some View {
    DuoGardenLayout(primaryScrollTarget: "map-level-\(beeLevel)") {
      hero
      if let round = store.round {
        Button("Resume \(round.level.map { "level \($0)" } ?? "daily words")") {
          store.presentingRound = true
        }.buttonStyle(GardenButton())
      }
      worldMap
        .overlayPreferenceValue(MapLevelAnchors.self) { anchors in
          GeometryReader { proxy in
            if let anchor = anchors[beeLevel] {
              let node = proxy[anchor]
              BeeView(accessory: store.save.wearing, size: 48)
                .rotationEffect(.degrees(-8))
                .position(x: node.midX, y: node.minY - 25)
                .animation(reduceMotion ? nil : .easeInOut(duration: 1.1).delay(0.35), value: beeLevel)
                .accessibilityLabel("Your bee is at level \(beeLevel)")
                .accessibilityIdentifier("map-bee")
            }
          }.allowsHitTesting(false)
        }
    } secondary: {
      RewardsView()
    }
    .navigationTitle("Spell-Bee.").navigationBarTitleDisplayMode(.inline)
    .onAppear {
      if !placedBee { beeLevel = currentLevel; placedBee = true }
    }
    .onChange(of: store.presentingRound) { _, playing in
      if !playing { beeLevel = currentLevel }
    }
    .onChange(of: currentLevel) { _, level in
      if !store.presentingRound { beeLevel = level }
    }
  }
  private var hero: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top) {
        Text("Your next\nbig adventure.")
          .font(.system(.largeTitle, design: .serif, weight: .bold))
          .fixedSize(horizontal: false, vertical: true)
          .layoutPriority(1)
        Spacer(minLength: 8)
        BeeView(accessory: store.save.wearing, size: 64)
          .accessibilityHidden(true)
      }
      Text("Five words. Five stars. A garden to discover.").font(.subheadline)
      VStack(alignment: .leading, spacing: 6) {
        Label(gardenComplete ? "Every level explored!" : "Level \(currentLevel)",
              systemImage: gardenComplete ? "checkmark.seal.fill" : "location.fill")
          .font(.headline).accessibilityIdentifier("map-current-level")
        if currentLevel < (store.levels.last?.id ?? 1) {
          Text("Finish level \(currentLevel) to fly to level \(currentLevel + 1).")
            .font(.subheadline)
        } else {
          Text(gardenComplete ? "Replay any flower to grow your stars." : "One last stop in the Royal Gardens.")
            .font(.subheadline)
        }
      }

      HStack {
        Label("\(store.save.stars)/60", systemImage: "star.fill")
        Text("·")
        Text("🍯 \(store.save.honey)")
      }.font(.headline)
    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
      .background(Garden.meadow, in: RoundedRectangle(cornerRadius: 28))
  }
  private var worldMap: some View {
    VStack(spacing: 24) {
      ForEach(0..<3) { worldIndex in
        GardenCard(color: worlds[worldIndex].2) {
          HStack {
            Text(worlds[worldIndex].3).font(.largeTitle)
            VStack(alignment: .leading) {
              Text(worlds[worldIndex].0).font(.title2.bold())
              Text(worlds[worldIndex].1).font(.subheadline)
            }
          }
          ZStack {
            VStack(spacing: 22) {
              ForEach(store.levels.filter { $0.world == worlds[worldIndex].0 }) { level in
                VStack(spacing: 8) {
                  Button {
                    beeLevel = level.id
                    store.start(level)
                  } label: {
                    Text("\(level.id)").font(.system(.title, design: .rounded, weight: .heavy))
                    .frame(width: 72, height: 72).foregroundStyle(
                      store.save.best[level.id] == nil ? Garden.ink : .white
                    ).background(
                      store.save.unlocked(level.id)
                        ? (store.save.best[level.id] == nil ? Garden.honey : Garden.green)
                        : Color.gray.opacity(0.2), in: Circle()
                    ).overlay(Circle().stroke(.white, lineWidth: 4)).shadow(
                      color: Garden.ink.opacity(0.18), radius: 1, y: 5)
                  }.anchorPreference(key: MapLevelAnchors.self, value: .bounds) { [level.id: $0] }
                  .overlay(alignment: .bottomTrailing) {
                    if store.save.best[level.id] != nil {
                      Image(systemName: "checkmark.circle.fill").font(.title3.bold())
                        .foregroundStyle(.white, Garden.green).background(.white, in: Circle())
                        .accessibilityHidden(true)
                    } else if !store.save.unlocked(level.id) {
                      Image(systemName: "lock.circle.fill").font(.title3)
                        .foregroundStyle(Garden.ink, Garden.paper)
                        .accessibilityHidden(true)
                    }
                  }
                  .overlay {
                    if level.id == currentLevel {
                      Circle().stroke(Garden.honey, lineWidth: 3).padding(-6).accessibilityHidden(true)
                    }
                  }
                  .disabled(!store.save.unlocked(level.id)).accessibilityLabel(
                    "Level \(level.id), \(level.id == currentLevel ? "current level" : levelStatus(level.id)), \(store.save.unlocked(level.id) ? "play" : "locked")"
                  ).accessibilityIdentifier("level-\(level.id)")
                  Stars(score: store.save.best[level.id] ?? 0)
                  if !levelStatus(level.id).isEmpty {
                    Text(levelStatus(level.id)).font(.caption.bold())
                      .foregroundStyle(level.id == currentLevel ? Garden.ink : Garden.green)
                      .multilineTextAlignment(.center)
                      .padding(.horizontal, 6).background(worlds[worldIndex].2, in: Capsule())
                  }
                }.padding(.top, 48)
                  .offset(x: level.id % 4 == 1 || level.id % 4 == 0 ? -35 : 35)
                  .id("map-level-\(level.id)")
              }
            }
          }.frame(maxWidth: .infinity)
            .backgroundPreferenceValue(MapLevelAnchors.self) { anchors in
              GeometryReader { proxy in
                let ids = anchors.keys.sorted()
                Path { path in
                  for (index, id) in ids.enumerated() {
                    if let anchor = anchors[id] {
                      let frame = proxy[anchor]
                      let point = CGPoint(x: frame.midX, y: frame.midY)
                      if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
                    }
                  }
                }.stroke(Garden.green.opacity(0.35), style: StrokeStyle(lineWidth: 4, dash: [5, 8]))
              }.accessibilityHidden(true)
            }
        }
      }
    }
  }
  private func levelStatus(_ id: Int) -> String {
    if id == currentLevel && !gardenComplete {
      return store.save.best[id] == nil ? "" : "Replaying · Completed"
    }
    if store.save.best[id] != nil { return "Completed" }
    if id == currentLevel + 1 { return "Up next" }
    return "Locked"
  }
}
private struct MapLevelAnchors: PreferenceKey {
  static var defaultValue: [Int: Anchor<CGRect>] { [:] }
  static func reduce(value: inout [Int: Anchor<CGRect>], nextValue: () -> [Int: Anchor<CGRect>]) {
    value.merge(nextValue(), uniquingKeysWith: { _, new in new })
  }
}
struct RewardsView: View {
  @EnvironmentObject var store: GameStore
  var body: some View {
    GardenCard {
      Text("Your honey jar").font(.title2.bold())
      VStack(alignment: .leading, spacing: 12) {
        Text("Your booster collection").bold()
        Label("Replays: Unlimited", systemImage: "speaker.wave.2.fill")
        ForEach(Booster.allCases) { booster in
          Label(
            "\(booster.title): \(store.save.boosters[booster.rawValue,default:0])",
            systemImage: booster.icon)
        }
      }.font(.subheadline).padding(16).frame(maxWidth: .infinity, alignment: .leading).background(
        Garden.meadow, in: RoundedRectangle(cornerRadius: 18))
      ZStack(alignment: .bottom) {
        RoundedRectangle(cornerRadius: 22).fill(Garden.honey.opacity(0.15))
        RoundedRectangle(cornerRadius: 18).fill(Garden.honey).frame(
          height: CGFloat(store.save.nextChest) * 1.1)
        Text("🍯").font(.system(size: 45)).frame(height: 110)
      }.frame(width: 100, height: 120).overlay(
        RoundedRectangle(cornerRadius: 22).stroke(Garden.honey, lineWidth: 4)
      ).frame(maxWidth: .infinity)
      Text(
        store.save.opened == 4
          ? "All four chests opened!" : "\(store.save.nextChest)/100 to your next chest"
      ).font(.headline).frame(maxWidth: .infinity)
      Button("🎁 Open mystery chest") { store.openChest() }.buttonStyle(GardenButton()).disabled(
        !store.save.canOpen
      ).accessibilityIdentifier("open-chest")
      if let prize = store.prize {
        Text("✨ You found \(prize.label)!").font(.headline).foregroundStyle(Garden.green)
          .accessibilityIdentifier("prize-reveal")
      }
      Text("Dress your bee").font(.headline)
      ForEach([0] + store.save.accessories.sorted(), id: \.self) { index in
        Button {
          store.save.wearing = index
          store.persist()
        } label: {
          HStack {
            Text("\(GameRules.outfitIcons[index]) \(GameRules.outfits[index])")
            Spacer()
            if store.save.wearing == index { Image(systemName: "checkmark.circle.fill") }
          }
        }.padding(.vertical, 5)
      }
    }
  }
}
struct LocalPlayView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @Environment(\.scenePhase) private var phase
  @FocusState private var answerFocused: Bool
  var body: some View {
    NavigationStack {
      DuoScrollView(maximumWidth: 620, resizeAnchor: answerFocused ? "local-answer-controls" : nil)
      {
        VStack(spacing: 22) {
          if let round = store.round, let word = round.current {
            HStack {
              Text(round.level.map { "LEVEL \($0)" } ?? "PRIVATE DAILY FIVE").font(.caption.bold())
              Spacer()
              Text("Word \(round.position + 1) of 5").font(.headline)
            }
            HStack {
              ForEach(0..<5) { index in
                Capsule().fill(
                  index < round.position
                    ? Garden.green
                    : index == round.position ? Garden.honey : Garden.green.opacity(0.15)
                ).frame(height: 7)
              }
            }
            WordDefinitionView(definition: word.definition)
            BeeView(accessory: store.save.wearing, size: 100)
            Button {
              store.listen()
            } label: {
              Label("Listen again", systemImage: "speaker.wave.2.fill")
            }.buttonStyle(GardenButton()).accessibilityIdentifier("listen")
            if round.day == nil {
              ViewThatFits(in: .horizontal) {
                HStack { boosterButtons(horizontal: true) }
                VStack { boosterButtons(horizontal: false) }
              }
              if round.used.contains("letter:\(round.position)") {
                Text(
                  "First letter: \(word.word.prefix(1).uppercased()) · \(word.word.count) letters"
                ).font(.headline)
              }
              if round.used.contains("hint:\(round.position)") {
                Text(word.hint).foregroundStyle(Garden.green)
              }
            }
            VStack(alignment: .leading, spacing: 10) {
              Text("Your spelling").font(.headline)
              TextField(
                "Type the word",
                text: Binding(get: { store.round?.draft ?? "" }, set: { store.draft($0) })
              ).font(.title2).padding(16).background(.white, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Garden.green.opacity(0.3)))
                .keyboardType(.asciiCapable)
                .textInputAutocapitalization(.never).autocorrectionDisabled().focused(
                  $answerFocused
                ).disabled(round.locked).submitLabel(.done).onSubmit { store.lock() }
                .accessibilityIdentifier("spelling-answer")
            }
            if !round.locked {
              Button("Lock it in") {
                answerFocused = false
                store.lock()
              }.buttonStyle(GardenButton()).disabled(
                round.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              ).accessibilityIdentifier("lock-answer").id("local-answer-controls")
            } else {
              GardenCard(color: Garden.meadow) {
                Text(round.correct ? "Beautifully spelled! 🌟" : "A new word for your garden. 🌱")
                  .font(.headline)
                Text("The spelling is **\(word.word)**.")
                Button(round.position == 4 ? "Collect my stars" : "Next word") { store.next() }
                  .buttonStyle(GardenButton()).accessibilityIdentifier("next-word")
              }
            }
            if round.day != nil {
              Text("Your results stay private. Answers are revealed after all five.").font(
                .footnote
              ).foregroundStyle(.secondary)
            }
          } else if let result = store.result {
            GardenCard(color: result.score >= 4 ? Garden.meadow : .white) {
              VictoryView(score: result.score)
              Text(
                "\(result.score)/5 correct\(result.level != nil ? " · +\(store.earned) honey" : "")"
              ).font(.headline).frame(maxWidth: .infinity).accessibilityIdentifier("round-score")
              ForEach(Array(result.words.enumerated()), id: \.offset) { index, word in
                HStack(alignment: .top) {
                  Image(
                    systemName: GameRules.correct(result.answers[index], word.word)
                      ? "checkmark.circle.fill" : "xmark.circle")
                  VStack(alignment: .leading) {
                    Text(word.word).bold()
                    if !GameRules.correct(result.answers[index], word.word) {
                      Text("You wrote: \(result.answers[index])").font(.subheadline)
                    }
                  }
                }
              }
              if let id = result.level, let level = store.levels.first(where: { $0.id == id }) {
                Button("Retry level") { store.start(level) }.buttonStyle(
                  GardenButton(secondary: true))
                if let next = store.levels.first(where: { $0.id == id + 1 }) {
                  Button("Explore next level") { store.start(next) }.buttonStyle(GardenButton())
                }
              }
              Button("Back to garden") {
                store.presentingRound = false
                store.result = nil
              }.buttonStyle(GardenButton(secondary: true))
            }.task(id: result.id) {
              if !store.isChild, let level = result.level {
                do { try await online.contribute(level: level, answers: result.answers) } catch {
                  online.error = error.localizedDescription
                }
              }
            }
          }
        }.padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
      }.background(Garden.paper).navigationTitle("Spell-Bee").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button("Garden", systemImage: "chevron.left") {
              store.audio.stop()
              store.presentingRound = false
            }
          }
        }.task(id: store.round.map { "\($0.id):\($0.position)" }) {
          guard phase == .active else { return }
          store.announce()
        }
    }
    .onDisappear { store.audio.stop() }
  }
  private func boosterButtons(horizontal: Bool) -> some View {
    ForEach(Booster.allCases) { booster in
      Button {
        store.booster(booster)
      } label: {
        Label(
          "\(booster == .slow ? "Slow" : booster == .letter ? "Letter" : "Hint") · \(store.save.boosters[booster.rawValue,default:0])",
          systemImage: booster.icon
        ).font(.subheadline.bold()).fixedSize(horizontal: horizontal, vertical: true)
          .frame(maxWidth: .infinity, minHeight: 24).padding(12).background(
            Garden.meadow, in: RoundedRectangle(cornerRadius: 12))
      }.disabled(
        store.round?.locked == true || store.save.boosters[booster.rawValue, default: 0] == 0
          || (booster != .slow
            && store.round?.used.contains("\(booster.rawValue):\(store.round?.position ?? 0)")
              == true)
      )
    }
  }
}
