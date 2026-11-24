# iPhone Duo readiness

Spell-Bee builds against the installed iOS 27.2 SDK and uses native SwiftUI scene, navigation and tab containers. Those system containers handle the Duo's vertical bars; custom content reads window-local reserved regions on iOS 27.1 and later. iOS 17–26 remain supported through the ordinary geometry fallback.

## Layout behavior

- The garden reads current window size on every layout. Wide windows show independently scrolling map and reward panes. Compact windows retain all reward controls in the main scroll, rather than hiding them.
- Active vertical/book folds place map and rewards on opposite sides; horizontal/laptop folds stack the panes. Neither pane includes the reserved fold gap.
- Forms and gameplay use one contiguous usable pane when folded. This deliberately prioritizes a readable, reachable spelling field over stretching a single form across the hinge. Content remains scrollable and respects the keyboard.
- Camera/other occlusion regions are excluded using their actual local frames, including Apple's margins. Layout is not based on a model name, screen bounds, physical orientation or a presumed symmetric safe area.
- Large accessibility text suppresses the optional sidebar in flat windows. Results choose a fitting five-star row. Booster labels choose a stacked fallback when a horizontal row cannot fit.
- Drafts, answers, scores, reward balances and inventory live above the layout in `GameStore` / `OnlineGame`; resizing does not initialize a new round. Focused spelling controls scroll into view as the usable pane changes.
- Online audio stops on scene deactivation, cancels stale pending loads and announces a question automatically only once in its view session. Local automatic speech is keyed by round ID and word position. Replays remain explicit and unlimited.

## Xcode resizability audit

Apple's `app-resizability` skill was exported using `xcrun agent skills export` and applied to the native target. Launch-screen, orientation, and full-screen opt-out checks pass: `UILaunchScreen` exists, all four orientations are declared, and `UIRequiresFullScreen` is absent. No conflicting `.xcconfig` exists.

All five task scans were checked: main-screen APIs, orientation-driven layout, idiom-driven layout, legacy safe-area/layout-guide APIs, and application-vs-scene lifecycle. There were no executable legacy sites to migrate. SwiftUI `WindowGroup` and `scenePhase` already provide scene lifecycle; no unnecessary UIKit SceneDelegate was added.

## Simulator setup

The iOS 27.2 arm64 runtime (24B114) was installed but its supported-device metadata excludes Duo. The iOS 27.1 arm64 runtime (24A94425) explicitly includes Duo and successfully created and ran **Spell-Bee iPhone Duo**. The installed 27.2 SDK builds the application for that runtime.

Run from the repository root:

```sh
ios/scripts/run-duo-simulator.sh
```

The launcher chooses the newest installed runtime that explicitly advertises Duo support, reuses an existing Duo simulator, builds, installs, and launches the app. It does not download runtimes or guess compatibility from the version number.

## Validation evidence

- 15 native unit tests pass: seven game rules and eight fold/camera/window/keyboard geometry cases.
- The five-word Adventure UI regression passes on iPhone 17 Pro / iOS 26.5.
- The standalone rotation regression passes with a partial answer entered, then rotates back and submits the completed word.
- The expanded-garden UI regression passes on iPad mini after waiting for the landscape window transition to settle; the independent rewards pane is visible and usable.
- Live Xcode device-interaction checks on iPhone 18 Pro / iOS 27.2 preserve partial text and keyboard focus during real portrait/landscape changes.
- Live Duo / iOS 27.1 checks verified the closed outer display, open inner display and partially open display. The same partial draft and keyboard focus survived opening/folding. The partial-fold gameplay pane stayed to one side of the hinge. Screenshots and hierarchy evidence are in `screenshots/duo-qa/`.
- Final installed-build checks confirmed the entire answer field and Lock button remain above the software keyboard in all three poses. Evidence: `closed-keyboard-final.png`, `open-keyboard-final.png`, and `partial-keyboard-final.png`. The final build includes the stacked-booster sizing and stale-audio cancellation fixes.

Physical-device checks remain part of release validation: real touch/keyboard ergonomics, speaker/speech behavior, thermal performance and repeated hardware folding. Simulator verification is not a claim of physical-device certification. Production account/iCloud/App Store work described in README remains separate.

## Apple references

- [Prepare your app for iPhone Duo](https://developer.apple.com/iphone-duo/prepare/)
- [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)
- [SwiftUI reserved regions](https://developer.apple.com/documentation/swiftui/reservedregion)
