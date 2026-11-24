// swift-tools-version: 6.0
import PackageDescription
let package = Package(name:"SpellBeeCore", platforms:[.macOS(.v13),.iOS(.v17)], products:[.library(name:"SpellBeeCore",targets:["SpellBeeCore"])], targets:[.target(name:"SpellBeeCore",path:"Sources/Core"),.testTarget(name:"SpellBeeCoreTests",dependencies:["SpellBeeCore"],path:"Tests")])
