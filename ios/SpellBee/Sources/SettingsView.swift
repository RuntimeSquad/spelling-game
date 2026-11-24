import SwiftUI
import UniformTypeIdentifiers

struct ProgressDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }
  var data: Data
  init(data: Data) { self.data = data }
  init(configuration: ReadConfiguration) throws {
    guard let data = configuration.file.regularFileContents else {
      throw CocoaError(.fileReadCorruptFile)
    }
    self.data = data
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
struct SettingsView: View {
  @EnvironmentObject var store: GameStore
  @EnvironmentObject var online: OnlineGame
  @State private var unlocked = false
  @State private var exporting = false
  @State private var importing = false
  @State private var document: ProgressDocument?
  @State private var restoring: Data?
  @State private var status = ""
  var body: some View {
    DuoScrollView {
      VStack(spacing: 24) {
        GardenCard(color: Garden.meadow) {
          BeeView(accessory: store.save.wearing, size: 120).frame(maxWidth: .infinity)
          Text("Your spelling story").font(.title.bold())
          Text("\(store.save.stars) stars · \(store.save.honey) honey").font(.headline)
          Toggle("Game sound", isOn: $store.sound).onChange(of: store.sound) { _, enabled in
            if !enabled { store.audio.stop() }
          }
          Text(
            store.isChild
              ? "Family experience · private play" : "13+ experience · invitation-only social play"
          ).font(.subheadline)
        }
        GardenCard {
          Text(store.isChild ? "Parent area" : "Progress and privacy").font(.title2.bold())
          if store.isChild && !unlocked {
            Text(
              "A parent or device owner unlocks backup and experience settings using the device passcode or biometrics."
            )
            Button("Unlock parent area") { Task { unlocked = await store.authorizeParent() } }
              .buttonStyle(GardenButton())
          } else {
            Text(
              "Progress saves automatically on this iPhone. To recover it on another iPhone, save a backup to iCloud Drive, then restore it in Spell-Bee there."
            ).font(.subheadline)
            Button("Save progress backup") {
              do {
                document = ProgressDocument(data: try JSONEncoder().encode(store.save))
                exporting = true
              } catch { status = error.localizedDescription }
            }.buttonStyle(GardenButton())
            Button("Restore progress backup") { importing = true }.buttonStyle(
              GardenButton(secondary: true))
            Text(
              "Backups contain Adventure progress, boosters, and accessories. Online challenge identity stays on this device. Automatic iCloud sync and account recovery need Apple account configuration before release."
            ).font(.footnote).foregroundStyle(.secondary)
            if store.isChild {
              Button("Switch to 13+ experience") {
                store.role = "older"
                unlocked = false
              }.buttonStyle(GardenButton(secondary: true))
            } else {
              Button("Use family experience") {
                store.role = "child"
                online.disconnect()
              }.buttonStyle(GardenButton(secondary: true))
            }
            if !store.isChild {
              Button("Delete online test account", role: .destructive) {
                Task {
                  await online.perform {
                    let _: EmptyResponse = try await online.call("requestDeletion")
                    online.disconnect()
                    OnlineGame.writeSession([:])
                    status =
                      "Online identity disabled and deletion queued. Adventure progress stays on this iPhone."
                  }
                }
              }
            }
          }
          if !status.isEmpty { Text(status).font(.footnote) }
        }
        GardenCard {
          Text("Made for a brighter day.").font(.headline)
          Text(
            "No advertising, purchases, chat, public search, or optional analytics. Family Adventure and daily play stay on this device. In the 13+ simulator preview, online gameplay sends a guest identifier, preset nickname, and answers to the local game server. Do not use this development build with real children’s online data."
          ).font(.subheadline)
          Text("This is a native development preview, not an App Store release.").font(.caption)
            .foregroundStyle(.secondary)
        }
      }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
    }.background(Garden.paper).navigationTitle("My bee")
      .fileExporter(
        isPresented: $exporting, document: document, contentType: .json,
        defaultFilename: "Spell-Bee-progress"
      ) { result in
        switch result {
        case .success: status = "Backup saved. Keep it in a safe place, such as iCloud Drive."
        case .failure(let error): status = error.localizedDescription
        }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
        do {
          let url = try result.get()
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let data = try Data(contentsOf: url)
          guard data.count < 100_000 else { throw CocoaError(.fileReadTooLarge) }
          let value = try JSONDecoder().decode(AdventureSave.self, from: data)
          guard value.validated() else { throw CocoaError(.fileReadCorruptFile) }
          restoring = data
        } catch { status = "Could not restore this file: \(error.localizedDescription)" }
      }
      .confirmationDialog(
        "Replace Adventure progress on this iPhone?",
        isPresented: Binding(get: { restoring != nil }, set: { if !$0 { restoring = nil } })
      ) {
        Button("Restore this backup") {
          if let data = restoring {
            do {
              try store.restore(data)
              status = "Adventure progress restored."
            } catch { status = error.localizedDescription }
          }
          restoring = nil
        }
      } message: {
        Text(
          "Save a backup of your current progress first if you want to keep it. This does not change age restrictions or online accounts."
        )
      }
      .onDisappear { unlocked = false }
  }
}
