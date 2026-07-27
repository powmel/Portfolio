import AppKit
import CryptoKit
import Foundation
import Photos
import Vision

nonisolated(unsafe) var automaticResultPath: String?

struct Analysis: Codable {
    let faceCount: Int
    let hasText: Bool
    let labels: [String]
    let aestheticScore: Double
}

struct ExportedAsset: Codable {
    let source: String
    let sourceId: String
    let capturedAt: String
    let width: Int
    let height: Int
    let filename: String
    let analysis: Analysis
}

struct RunResult: Codable {
    let status: String
    let exported: Int
    let newestCapturedAt: String?
    let items: [ExportedAsset]
    let message: String?
}

enum BridgeError: Error, LocalizedError {
    case invalidArguments(String)
    case imageUnavailable
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .invalidArguments(let message): return message
        case .imageUnavailable: return "PhotoKit could not create a review image."
        case .encodingFailed: return "The review JPEG could not be encoded."
        }
    }
}

func argument(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else {
        return nil
    }
    return CommandLine.arguments[index + 1]
}

func printJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(value)
    if let resultPath = argument("--result") ?? automaticResultPath {
        try data.write(to: URL(fileURLWithPath: resultPath), options: .atomic)
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

func authorizationStatus() -> PHAuthorizationStatus {
    let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard current == .notDetermined else { return current }
    final class AuthorizationBox: @unchecked Sendable {
        var status: PHAuthorizationStatus
        init(_ status: PHAuthorizationStatus) { self.status = status }
    }
    let semaphore = DispatchSemaphore(value: 0)
    let result = AuthorizationBox(current)
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        result.status = status
        semaphore.signal()
    }
    semaphore.wait()
    return result.status
}

func reviewImage(for asset: PHAsset) throws -> CGImage {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = true
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    var output: CGImage?
    PHImageManager.default().requestImage(
        for: asset,
        targetSize: CGSize(width: 1800, height: 1800),
        contentMode: .aspectFit,
        options: options
    ) { image, _ in
        output = image?.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }
    guard let output else { throw BridgeError.imageUnavailable }
    return output
}

func classify(_ image: CGImage) throws -> Analysis {
    let faceRequest = VNDetectFaceRectanglesRequest()
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .fast
    textRequest.usesLanguageCorrection = false
    let classificationRequest = VNClassifyImageRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([faceRequest, textRequest, classificationRequest])
    let faces = faceRequest.results?.count ?? 0
    let hasText = (textRequest.results?.contains { observation in
        guard let candidate = observation.topCandidates(1).first else { return false }
        return candidate.confidence >= 0.45 && candidate.string.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
    }) ?? false
    let labels = (classificationRequest.results ?? [])
        .filter { $0.confidence >= 0.18 }
        .prefix(5)
        .map(\.identifier)
    let topConfidence = Double(classificationRequest.results?.first?.confidence ?? 0)
    let balanced = min(Double(image.width), Double(image.height)) / max(Double(image.width), Double(image.height))
    let aestheticScore = min(1, 0.45 + balanced * 0.35 + topConfidence * 0.2)
    return Analysis(faceCount: faces, hasText: hasText, labels: labels, aestheticScore: aestheticScore)
}

func jpegData(_ image: CGImage) throws -> Data {
    let representation = NSBitmapImageRep(cgImage: image)
    guard let data = representation.representation(using: .jpeg, properties: [.compressionFactor: 0.84]) else {
        throw BridgeError.encodingFailed
    }
    return data
}

func stableName(for asset: PHAsset) -> String {
    let digest = SHA256.hash(data: Data(asset.localIdentifier.utf8))
    return digest.prefix(10).map { String(format: "%02x", $0) }.joined()
}

func exportAssets(outputURL: URL, since: Date, limit: Int) throws -> RunResult {
    try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "creationDate >= %@", since as NSDate)
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = limit
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    var exported: [ExportedAsset] = []

    assets.enumerateObjects { asset, _, _ in
        do {
            let image = try reviewImage(for: asset)
            let analysis = try classify(image)
            let capturedAt = formatter.string(from: asset.creationDate ?? Date())
            let name = "\(capturedAt.prefix(10))-\(stableName(for: asset)).jpg"
            let imageURL = outputURL.appendingPathComponent(name)
            try jpegData(image).write(to: imageURL, options: .atomic)
            let record = ExportedAsset(
                source: "apple-photos",
                sourceId: asset.localIdentifier,
                capturedAt: capturedAt,
                width: asset.pixelWidth,
                height: asset.pixelHeight,
                filename: name,
                analysis: analysis
            )
            try encoder.encode(record).write(to: URL(fileURLWithPath: imageURL.path + ".json"), options: .atomic)
            exported.append(record)
        } catch {
            FileHandle.standardError.write(Data("Skipped \(asset.localIdentifier): \(error.localizedDescription)\n".utf8))
        }
    }
    return RunResult(
        status: "authorized",
        exported: exported.count,
        newestCapturedAt: exported.first?.capturedAt,
        items: exported,
        message: nil
    )
}

do {
    let executableURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
    let bundledRoot = executableURL.path.contains(".app/Contents/MacOS/")
        ? executableURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        : nil
    if let bundledRoot {
        automaticResultPath = bundledRoot.appendingPathComponent(".local-media/apple-photos-last-result.json").path
    }
    if let fixturePath = argument("--fixture") {
        let data = try Data(contentsOf: URL(fileURLWithPath: fixturePath))
        let fixture = try JSONDecoder().decode(RunResult.self, from: data)
        try printJSON(fixture)
        exit(EXIT_SUCCESS)
    }

    guard let output = argument("--output") ?? bundledRoot?.appendingPathComponent(".local-media/apple-photos").path else {
        throw BridgeError.invalidArguments("Usage: apple-photos-bridge --output DIR [--since ISO8601] [--limit N]")
    }
    let formatter = ISO8601DateFormatter()
    let since = argument("--since").flatMap(formatter.date(from:))
        ?? Calendar.current.date(byAdding: .day, value: -21, to: Date())
        ?? Date(timeIntervalSinceNow: -21 * 86400)
    let limit = max(1, min(250, Int(argument("--limit") ?? "80") ?? 80))
    let status = authorizationStatus()
    guard status == .authorized || status == .limited else {
        try printJSON(RunResult(
            status: "permission_required",
            exported: 0,
            newestCapturedAt: nil,
            items: [],
            message: "Allow Photos access for Apple Photos Bridge in System Settings > Privacy & Security > Photos."
        ))
        exit(EXIT_FAILURE)
    }
    try printJSON(exportAssets(outputURL: URL(fileURLWithPath: output), since: since, limit: limit))
} catch {
    try? printJSON(RunResult(
        status: "error",
        exported: 0,
        newestCapturedAt: nil,
        items: [],
        message: error.localizedDescription
    ))
    exit(EXIT_FAILURE)
}
