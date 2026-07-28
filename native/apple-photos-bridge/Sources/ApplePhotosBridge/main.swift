import AppKit
import CryptoKit
import Foundation
import ImageIO
import Photos
import Vision

nonisolated(unsafe) var automaticResultPath: String?

struct Analysis: Codable {
    let faceCount: Int
    let hasText: Bool
    let labels: [String]
    let aestheticScore: Double
}

struct AnalysisResult: Codable {
    let status: String
    let analysis: Analysis?
    let message: String?
}

struct LibraryDiagnosis: Codable {
    let status: String
    let allAssets: Int
    let images: Int
    let videos: Int
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
    case imageDownloadTimedOut

    var errorDescription: String? {
        switch self {
        case .invalidArguments(let message): return message
        case .imageUnavailable: return "PhotoKit could not create a review image."
        case .encodingFailed: return "The review JPEG could not be encoded."
        case .imageDownloadTimedOut: return "Timed out while downloading the iCloud photo."
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

func cachedPhotosDerivative(for asset: PHAsset) -> CGImage? {
    guard let identifier = asset.localIdentifier.split(separator: "/").first.map(String.init),
          let prefix = identifier.first else {
        return nil
    }
    let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Pictures/Photos Library.photoslibrary/resources/derivatives/masters")
        .appendingPathComponent(String(prefix))
    guard let files = try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
    ) else {
        return nil
    }
    let candidates = files.filter {
        $0.lastPathComponent.hasPrefix(identifier + "_")
            && ["jpg", "jpeg"].contains($0.pathExtension.lowercased())
    }
    var best: CGImage?
    for url in candidates {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            continue
        }
        if best == nil || image.width * image.height > best!.width * best!.height {
            best = image
        }
    }
    return best
}

func reviewImage(for asset: PHAsset) throws -> CGImage {
    let previewOptions = PHImageRequestOptions()
    previewOptions.isSynchronous = true
    previewOptions.isNetworkAccessAllowed = false
    previewOptions.deliveryMode = .fastFormat
    previewOptions.resizeMode = .fast
    var localPreview: CGImage?
    PHImageManager.default().requestImage(
        for: asset,
        targetSize: CGSize(width: 1200, height: 1200),
        contentMode: .aspectFit,
        options: previewOptions
    ) { image, _ in
        localPreview = image?.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }
    if let localPreview, max(localPreview.width, localPreview.height) >= 640 {
        return localPreview
    }
    if let derivative = cachedPhotosDerivative(for: asset) {
        return derivative
    }

    let networkOptions = PHImageRequestOptions()
    networkOptions.isSynchronous = false
    networkOptions.isNetworkAccessAllowed = true
    networkOptions.deliveryMode = .highQualityFormat
    networkOptions.resizeMode = .fast
    var networkPreview: CGImage?
    var networkRequestFinished = false
    PHImageManager.default().requestImage(
        for: asset,
        targetSize: CGSize(width: 1200, height: 1200),
        contentMode: .aspectFit,
        options: networkOptions
    ) { image, info in
        if let candidate = image?.cgImage(forProposedRect: nil, context: nil, hints: nil) {
            networkPreview = candidate
        }
        let degraded = info?[PHImageResultIsDegradedKey] as? Bool ?? false
        let cancelled = info?[PHImageCancelledKey] as? Bool ?? false
        let error = info?[PHImageErrorKey] as? Error
        if !degraded || cancelled || error != nil {
            networkRequestFinished = true
        }
    }
    let deadline = Date(timeIntervalSinceNow: 60)
    while !networkRequestFinished && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
    }
    if let networkPreview {
        return networkPreview
    }
    if let localPreview {
        return localPreview
    }

    let resources = PHAssetResource.assetResources(for: asset)
    guard let resource = resources.first(where: {
        $0.type == .photo || $0.type == .fullSizePhoto || $0.type == .alternatePhoto
    }) else {
        throw BridgeError.imageUnavailable
    }
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true
    let semaphore = DispatchSemaphore(value: 0)
    final class ImageDataBox: @unchecked Sendable {
        private let lock = NSLock()
        private var storage = Data()
        private var failure: String?
        func append(_ chunk: Data) {
            lock.lock()
            storage.append(chunk)
            lock.unlock()
        }
        func value() -> Data {
            lock.lock()
            defer { lock.unlock() }
            return storage
        }
        func fail(_ error: Error) {
            lock.lock()
            failure = error.localizedDescription
            lock.unlock()
        }
        func errorMessage() -> String? {
            lock.lock()
            defer { lock.unlock() }
            return failure
        }
    }
    let result = ImageDataBox()
    PHAssetResourceManager.default().requestData(
        for: resource,
        options: options,
        dataReceivedHandler: { chunk in
            result.append(chunk)
        },
        completionHandler: { error in
            if let error { result.fail(error) }
            semaphore.signal()
    })
    guard semaphore.wait(timeout: .now() + 180) == .success else {
        throw BridgeError.imageDownloadTimedOut
    }
    let data = result.value()
    if let message = result.errorMessage() {
        throw BridgeError.invalidArguments("PhotoKit resource error: \(message)")
    }
    guard !data.isEmpty,
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let output = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 1800,
            kCGImageSourceCreateThumbnailWithTransform: true
          ] as CFDictionary) else {
        throw BridgeError.imageUnavailable
    }
    return output
}

func classify(_ image: CGImage) throws -> Analysis {
    let faceRequest = VNDetectFaceRectanglesRequest()
    let textRequest = VNDetectTextRectanglesRequest()
    textRequest.reportCharacterBoxes = false
    let classificationRequest = VNClassifyImageRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([faceRequest, textRequest, classificationRequest])
    let faces = faceRequest.results?.count ?? 0
    let hasText = !(textRequest.results?.isEmpty ?? true)
    let labels = (classificationRequest.results ?? [])
        .filter { $0.confidence >= 0.18 }
        .prefix(5)
        .map(\.identifier)
    let topConfidence = Double(classificationRequest.results?.first?.confidence ?? 0)
    let balanced = min(Double(image.width), Double(image.height)) / max(Double(image.width), Double(image.height))
    let aestheticScore = min(1, 0.45 + balanced * 0.35 + topConfidence * 0.2)
    return Analysis(faceCount: faces, hasText: hasText, labels: labels, aestheticScore: aestheticScore)
}

func unprocessedAnalysis() -> Analysis {
    Analysis(faceCount: 0, hasText: false, labels: [], aestheticScore: 0.5)
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
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = limit
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    var exported: [ExportedAsset] = []
    var skippedErrors: [String] = []

    assets.enumerateObjects { asset, _, _ in
        do {
            guard let creationDate = asset.creationDate, creationDate >= since else { return }
            let image = try reviewImage(for: asset)
            let analysis = CommandLine.arguments.contains("--enable-analysis")
                ? try classify(image)
                : unprocessedAnalysis()
            let capturedAt = formatter.string(from: creationDate)
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
            if skippedErrors.count < 5 {
                skippedErrors.append(error.localizedDescription)
            }
            FileHandle.standardError.write(Data("Skipped \(asset.localIdentifier): \(error.localizedDescription)\n".utf8))
        }
    }
    return RunResult(
        status: "authorized",
        exported: exported.count,
        newestCapturedAt: exported.first?.capturedAt,
        items: exported,
        message: skippedErrors.isEmpty ? nil : "Skipped assets: \(skippedErrors.joined(separator: " | "))"
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
            .deletingLastPathComponent()
        : nil
    if bundledRoot != nil {
        _ = NSApplication.shared
        NSApp.setActivationPolicy(.accessory)
        if PHPhotoLibrary.authorizationStatus(for: .readWrite) == .notDetermined {
            NSApp.activate(ignoringOtherApps: true)
        }
    }
    if let bundledRoot {
        automaticResultPath = bundledRoot.appendingPathComponent(".local-media/apple-photos-last-result.json").path
    }
    if let fixturePath = argument("--fixture") {
        let data = try Data(contentsOf: URL(fileURLWithPath: fixturePath))
        let fixture = try JSONDecoder().decode(RunResult.self, from: data)
        try printJSON(fixture)
        exit(EXIT_SUCCESS)
    }
    if let imagePath = argument("--analyze-image") {
        guard let image = NSImage(contentsOfFile: imagePath),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw BridgeError.imageUnavailable
        }
        try printJSON(AnalysisResult(status: "analyzed", analysis: try classify(cgImage), message: nil))
        exit(EXIT_SUCCESS)
    }
    if let imagePath = argument("--prepare-image") {
        guard NSImage(contentsOfFile: imagePath) != nil else {
            throw BridgeError.imageUnavailable
        }
        try printJSON(AnalysisResult(status: "prepared", analysis: unprocessedAnalysis(), message: nil))
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
    if CommandLine.arguments.contains("--diagnose-library") {
        try printJSON(LibraryDiagnosis(
            status: "authorized",
            allAssets: PHAsset.fetchAssets(with: nil).count,
            images: PHAsset.fetchAssets(with: .image, options: nil).count,
            videos: PHAsset.fetchAssets(with: .video, options: nil).count
        ))
        exit(EXIT_SUCCESS)
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
