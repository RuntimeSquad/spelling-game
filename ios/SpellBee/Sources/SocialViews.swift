import AVFoundation
import SwiftUI
import UIKit

struct DailyView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  var body: some View {
    DuoScrollView(resizeAnchor: "online-answer-controls") {
      VStack(spacing: 24) {
        GardenCard(color: Garden.meadow) {
          Text("A fresh five.\nEvery day.").font(
            .system(.largeTitle, design: .serif, weight: .bold))
          Text("A little daily ritual for your spelling wings.")
          Text(GameRules.day()).font(.headline)
          Button(store.isChild ? "Play my private daily five" : "Play daily challenge") {
            if store.isChild { store.daily() } else { Task { await online.openDaily() } }
          }.buttonStyle(GardenButton())
          if store.isChild {
            Text("Only you see your results. No account or internet needed.").font(.footnote)
          }
        }
        if !store.isChild, online.state?.challenge.kind == "daily" { OnlineRoundView() }
        if !store.isChild { OnlineStatus() }
      }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
    }.background(Garden.paper).navigationTitle("Daily five")
  }
}
struct SocialLocked: View {
  var body: some View {
    GardenCard(color: Garden.meadow) {
      BeeView(size: 90).frame(maxWidth: .infinity)
      Text("A garden just for you.").font(.title2.bold())
      Text(
        "Friend challenges and teams aren’t available in the under-13 experience. You can play every Adventure level and your private daily five."
      )
    }
  }
}
private struct FriendInvitation: Identifiable {
  let id = UUID()
  let url: URL
}
private struct FriendInvitationSheet: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(
      activityItems: ["Join my five-word Spell-Bee challenge!", url], applicationActivities: nil)
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct FriendsView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @State private var code = ""
  @State private var invitation: FriendInvitation?
  var body: some View {
    DuoScrollView(resizeAnchor: "online-answer-controls") {
      VStack(spacing: 24) {
        if store.isChild {
          SocialLocked()
        } else {
          GardenCard {
            Text("Five words.\nYour friends. Your turn.").font(
              .system(.title, design: .serif, weight: .bold))
            Text(
              "Send a private invitation. Everyone gets the same five words and a 24-hour window. Results are revealed when the challenge closes."
            )
            Button {
              Task {
                let url: URL?
                if let challenge = online.state?.challenge, challenge.kind == "private",
                   challenge.closeDate > Date() {
                  url = URL(string: "spellbee://challenge/\(challenge.id)")
                } else {
                  url = await online.createFriend()
                }
                if let url, !store.isChild { invitation = FriendInvitation(url: url) }
              }
            } label: {
              Label(online.busy ? "Preparing invitation…" : "Invite friends now",
                    systemImage: "person.badge.plus")
            }.buttonStyle(GardenButton()).disabled(online.busy)
              .accessibilityIdentifier("invite-friends-now")
            Text("Invite them before you play. Choose how to send your invitation on the next screen.")
              .font(.subheadline)
            if let challenge = online.state?.challenge, challenge.kind == "private" {
              Text("Challenge code: \(challenge.id)").font(.caption).textSelection(.enabled)
            }
            TextField("Challenge code or invitation link", text: $code).textInputAutocapitalization(
              .never
            ).autocorrectionDisabled().textFieldStyle(.roundedBorder).accessibilityIdentifier(
              "friend-code")
            Button("Join challenge") { Task { await online.join(code) } }.buttonStyle(
              GardenButton(secondary: true)
            ).disabled(code.isEmpty || online.busy)
          }
          if online.state?.challenge.kind == "private" { OnlineRoundView() }
          OnlineStatus()
        }
      }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
    }.background(Garden.paper).navigationTitle("Friend challenges")
      .sheet(item: $invitation) { item in
        if !store.isChild { FriendInvitationSheet(url: item.url) }
      }
      .onChange(of: store.isChild) { _, child in
        if child { invitation = nil }
      }
  }
}
@MainActor final class RecordingPlayer: ObservableObject {
  private var player: AVAudioPlayer?
  private var generation = 0
  private var announced = Set<String>()
  @Published var error: String?
  func load(_ url: URL, question: String) async {
    stop()
    let requestGeneration = generation
    player = nil
    error = nil
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      guard !Task.isCancelled, generation == requestGeneration else { return }
      guard (response as? HTTPURLResponse)?.statusCode == 200 else {
        throw RemoteError(message: "This audio link has expired. Refresh your word.")
      }
      try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
      try AVAudioSession.sharedInstance().setActive(true)
      player = try AVAudioPlayer(data: data)
      if !announced.contains(question), player?.play() == true { announced.insert(question) }
    } catch {
      if !Task.isCancelled && generation == requestGeneration {
        self.error = error.localizedDescription
      }
    }
  }
  func replay() {
    player?.currentTime = 0
    player?.play()
  }
  func stop() {
    generation += 1
    player?.stop()
  }
}
struct OnlineRoundView: View {
  @Environment(\.scenePhase) private var phase
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @StateObject private var recording = RecordingPlayer()
  var body: some View {
    if let state = online.state {
      GardenCard {
        if state.attempt == nil {
          Picker("Your bee nickname", selection: $online.nickname) {
            ForEach(
              ["Garden Bee", "Clover Bee", "Sunny Bee", "Honey Bee", "Daisy Bee"], id: \.self
            ) { Text($0) }
          }
          Button("Play these five words") { Task { await online.start() } }.buttonStyle(
            GardenButton()
          ).disabled(online.busy)
        } else if state.attempt?.status == "active" {
          Text("Word \((state.attempt?.position ?? 0) + 1) of 5").font(.title2.bold())
          if let prompt = online.prompt {
            WordDefinitionView(definition: prompt.definition)
            Button {
              if store.sound { recording.replay() }
            } label: {
              Label("Listen again", systemImage: "speaker.wave.2.fill")
            }.buttonStyle(GardenButton()).task(id: "\(prompt.audioUrl):\(phase == .active)") {
              if store.sound && phase == .active {
                await recording.load(
                  prompt.audioUrl, question: "\(state.challenge.id):\(prompt.position)")
              }
            }
            TextField(
              "Your spelling", text: Binding(get: { online.answer }, set: { online.setDraft($0) })
            ).keyboardType(.asciiCapable)
              .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(
              .roundedBorder
            ).font(.title2).submitLabel(.done).onSubmit { submit() }.accessibilityIdentifier(
              "online-answer")
            Button("Lock it in") { submit() }.buttonStyle(GardenButton()).disabled(
              online.answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || online.busy
            ).id("online-answer-controls")
            Text("Answers lock when submitted. Listen as often as you like.").font(.footnote)
          } else {
            ProgressView("Preparing your word…")
          }
        } else if let results = state.results {
          VictoryView(score: results.score)
          ForEach(results.items) { answer in
            HStack(alignment: .top) {
              Image(systemName: answer.correct ? "checkmark.circle.fill" : "xmark.circle")
              VStack(alignment: .leading) {
                Text(answer.word).bold()
                if let submitted = answer.submitted, !answer.correct {
                  Text("You wrote: \(submitted)").font(.subheadline)
                }
                Text(answer.definition).font(.subheadline)
              }
            }
          }
        } else {
          Text("Your answers are saved.").font(.title2.bold())
          Text("Score and spellings will be revealed after this challenge closes.")
        }
        if state.attempt?.status != "active" {
          if let standings = online.standings, standings.closed {
            Text("Final standings").font(.title2.bold())
            ForEach(Array(standings.rows.enumerated()), id: \.offset) { _, row in
              HStack {
                Text("\(row.rank).")
                Text(row.displayName)
                Spacer()
                Text("\(row.score)/5").bold()
              }
            }
          } else {
            Text("Closes \(state.challenge.closeDate.formatted(date:.abbreviated,time:.shortened))")
              .font(.footnote)
          }
        }
        if let error = recording.error { Text(error).foregroundStyle(.red).font(.footnote) }
        Button("Refresh challenge") { Task { await online.refresh() } }.disabled(online.busy)
      }.onDisappear { recording.stop() }
        .onChange(of: phase) { _, phase in if phase != .active { recording.stop() } }
        .onChange(of: store.sound) { _, sound in if !sound { recording.stop() } }
    }
  }
  private func submit() {
    Task {
      let old = online.state?.attempt?.position
      await online.submit()
      if online.error == nil && online.state?.attempt?.position != old {
        store.audio.cue(.correct, enabled: store.sound)
      }
    }
  }
}
struct OnlineStatus: View {
  @EnvironmentObject var online: OnlineGame
  var body: some View {
    VStack(spacing: 12) {
      if online.busy { ProgressView("Connecting to your hive…") }
      if let error = online.error {
        Text(error).font(.subheadline).foregroundStyle(.red).accessibilityIdentifier("online-error")
      }
      Text("Simulator preview · online play uses local test data.").font(.caption).foregroundStyle(
        .secondary)
    }
  }
}
struct TeamsView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @State private var code = ""
  var body: some View {
    DuoScrollView {
      VStack(spacing: 24) {
        if store.isChild {
          SocialLocked()
        } else {
          GardenCard(color: Garden.meadow) {
            Text("Your weekly hive").font(.system(.largeTitle, design: .serif, weight: .bold))
            if let hive = online.hive {
              Text(hive.name).font(.title2.bold())
              Text("Master 100 words together this week.")
              ProgressView(value: Double(min(hive.total, hive.goal)), total: Double(hive.goal))
                .tint(Garden.green)
              Text(
                "\(hive.total)/\(hive.goal) words\(hive.total >= hive.goal ? " · Hive goal complete! 🏆" : "")"
              ).bold()
              Text(
                "Correct Adventure words count once per level each week. Resets Monday at 00:00 UTC."
              ).font(.footnote)
              ShareLink(item: hive.code) {
                Label("Share team code", systemImage: "square.and.arrow.up")
              }
              Text("Invite code: \(hive.code)").font(.caption).textSelection(.enabled)
              Button("Refresh team") { Task { await online.team() } }.buttonStyle(GardenButton())
              Button("Leave team") { Task { await online.team("leave") } }.buttonStyle(
                GardenButton(secondary: true))
            } else {
              Text("A private group. A shared goal. Every word helps.")
              Button("Create my hive") { Task { await online.team("create") } }.buttonStyle(
                GardenButton())
              TextField("Team invite code", text: $code).textInputAutocapitalization(.never)
                .autocorrectionDisabled().textFieldStyle(.roundedBorder)
              Button("Join invited team") { Task { await online.team("join", code: code) } }
                .buttonStyle(GardenButton(secondary: true)).disabled(code.isEmpty)
            }
          }.disabled(online.busy)
          OnlineStatus()
        }
      }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
    }.background(Garden.paper).navigationTitle("Teams").task {
      if !store.isChild { await online.team() }
    }
  }
}
