#!/bin/zsh
set -euo pipefail
project_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$project_root"
# Choose a runtime that explicitly advertises Duo support, rather than assuming
# that the latest installed iOS runtime contains every simulator device model.
runtime_id=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; rs=[r for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and any(d["identifier"]=="com.apple.CoreSimulator.SimDeviceType.iPhone-Duo" for d in r.get("supportedDeviceTypes",[]))];rs.sort(key=lambda r:tuple(map(int,r["version"].split("."))),reverse=True);print(rs[0]["identifier"] if rs else "")')
if [[ -z "$runtime_id" ]]; then
  echo 'Install an iOS simulator runtime that supports iPhone Duo in Xcode Settings > Components.'
  echo 'The iOS 27.1 (24A94425) runtime has been verified with this project.'
  exit 1
fi
simulator_id=$(xcrun simctl list devices available -j | python3 -c 'import json,sys;ds=json.load(sys.stdin)["devices"].get(sys.argv[1],[]);matches=[d for d in ds if d.get("deviceTypeIdentifier")=="com.apple.CoreSimulator.SimDeviceType.iPhone-Duo"];print(matches[0]["udid"] if matches else "")' "$runtime_id")
if [[ -z "$simulator_id" ]]; then
  simulator_id=$(xcrun simctl create 'Spell-Bee iPhone Duo' com.apple.CoreSimulator.SimDeviceType.iPhone-Duo "$runtime_id")
fi
SPELLBEE_SIMULATOR_UDID="$simulator_id" "$project_root/ios/scripts/run-simulator.sh"
