import AVFoundation
import UIKit

enum GameCue { case correct, incorrect, reward, four, perfect }
@MainActor final class GameAudio: NSObject, AVSpeechSynthesizerDelegate {
  private let speech = AVSpeechSynthesizer()
  private var player: AVAudioPlayer?
  override init() {
    super.init()
    speech.delegate = self
  }
  private func activate() {
    try? AVAudioSession.sharedInstance().setCategory(
      .playback, mode: .default, options: [.mixWithOthers])
    try? AVAudioSession.sharedInstance().setActive(true)
  }
  @discardableResult func speak(_ word: String, slow: Bool = false, enabled: Bool = true) -> Bool {
    guard enabled else { return false }
    stop()
    activate()
    let utterance = AVSpeechUtterance(string: word)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    utterance.rate = slow ? 0.32 : 0.46
    speech.speak(utterance)
    return true
  }
  func stop() {
    speech.stopSpeaking(at: .immediate)
    player?.stop()
  }
  func cue(_ cue: GameCue, enabled: Bool) {
    let feedback = UINotificationFeedbackGenerator()
    feedback.notificationOccurred(cue == .incorrect ? .warning : .success)
    guard enabled else { return }
    activate()
    let notes: [Double] =
      switch cue {
      case .correct: [660, 880]
      case .incorrect: [392, 293.66]
      case .reward: [523.25, 659.25, 783.99, 1046.5]
      case .four: [523.25, 659.25, 783.99, 880, 783.99, 1046.5]
      case .perfect:
        [
          523.25, 659.25, 783.99, 1046.5, 783.99, 880, 987.77, 1046.5, 1318.51, 1567.98, 1046.5,
          1318.51, 1567.98,
        ]
      }
    let rate = 44100
    let length = Int(Double(notes.count) * 0.14 * Double(rate))
    let samples = (0..<length).map { index -> Int16 in
      let t = Double(index) / Double(rate)
      let note = min(notes.count - 1, Int(t / 0.14))
      let local = t.truncatingRemainder(dividingBy: 0.14)
      return Int16(sin(2 * .pi * notes[note] * t) * min(1, local / 0.008) * exp(-local * 22) * 6000)
    }
    var data = Data()
    func word<T: FixedWidthInteger>(_ value: T) {
      var v = value.littleEndian
      withUnsafeBytes(of: &v) { data.append(contentsOf: $0) }
    }
    data.append(Data("RIFF".utf8))
    word(UInt32(36 + length * 2))
    data.append(Data("WAVEfmt ".utf8))
    word(UInt32(16))
    word(UInt16(1))
    word(UInt16(1))
    word(UInt32(rate))
    word(UInt32(rate * 2))
    word(UInt16(2))
    word(UInt16(16))
    data.append(Data("data".utf8))
    word(UInt32(length * 2))
    for sample in samples { word(sample) }
    player = try? AVAudioPlayer(data: data)
    player?.play()
  }
}
