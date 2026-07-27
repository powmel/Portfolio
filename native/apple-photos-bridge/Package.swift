// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ApplePhotosBridge",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "apple-photos-bridge", targets: ["ApplePhotosBridge"])
    ],
    targets: [
        .executableTarget(name: "ApplePhotosBridge")
    ]
)

