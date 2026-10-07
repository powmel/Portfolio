import Foundation
import ImageIO
import UniformTypeIdentifiers

// Decode pixels with orientation applied; never copy source metadata dictionaries.
guard CommandLine.arguments.count == 3 else {
    fputs("Usage: render-public-photo INPUT OUTPUT\n", stderr)
    exit(1)
}
let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let destinationURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 1800
      ] as CFDictionary),
      let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    fputs("Could not decode photo or prepare public JPEG.\n", stderr)
    exit(1)
}
CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
guard CGImageDestinationFinalize(destination) else {
    fputs("Could not save public JPEG.\n", stderr)
    exit(1)
}
