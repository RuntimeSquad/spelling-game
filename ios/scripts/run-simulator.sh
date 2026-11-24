#!/bin/zsh
set -euo pipefail
project_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$project_root"
simulator_id=${SPELLBEE_SIMULATOR_UDID:-$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; choices=[(r,x) for r,ds in d.items() for x in ds if x["name"]=="iPhone 17 Pro"]; choices.sort(key=lambda p:tuple(int(n) for n in p[0].split("iOS-")[-1].split("-")),reverse=True); print(choices[0][1]["udid"] if choices else "")')}
if [[ -z "$simulator_id" ]]; then
  echo 'Install an iPhone simulator runtime in Xcode, then run this script again.'
  exit 1
fi
xcrun simctl boot "$simulator_id" 2>/dev/null || true
xcrun simctl bootstatus "$simulator_id" -b
xcodebuild -project ios/SpellBee.xcodeproj -scheme SpellBee -configuration Debug \
  -destination "platform=iOS Simulator,id=$simulator_id" -derivedDataPath ios/.build \
  CODE_SIGNING_ALLOWED=NO build -quiet
xcrun simctl install "$simulator_id" ios/.build/Build/Products/Debug-iphonesimulator/SpellBee.app
xcrun simctl launch --terminate-running-process "$simulator_id" com.spellbee.native.preview -experience "${SPELLBEE_EXPERIENCE:-older}"
# Xcode 27 uses Device Hub; earlier versions use Simulator.
open -b com.apple.dt.Devices 2>/dev/null || open -b com.apple.iphonesimulator
