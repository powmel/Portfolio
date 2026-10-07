"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
if (process.platform !== "darwin") { console.log("SKIP: ImageIO fixture requires macOS."); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-photo-test-"));
try {
  const fixture = path.join(dir, "fixture.swift");
  fs.writeFileSync(fixture, `import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
let input = URL(fileURLWithPath: CommandLine.arguments[2])
if CommandLine.arguments[1] == "create" {
  let context = CGContext(data:nil, width:70, height:40, bitsPerComponent:8, bytesPerRow:0, space:CGColorSpaceCreateDeviceRGB(), bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue)!
  context.setFillColor(CGColor(red:0.2,green:0.5,blue:0.7,alpha:1)); context.fill(CGRect(x:0,y:0,width:70,height:40))
  let destination = CGImageDestinationCreateWithURL(input as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, context.makeImage()!, [
    kCGImagePropertyOrientation: 6,
    kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 35.0, kCGImagePropertyGPSLatitudeRef:"N", kCGImagePropertyGPSLongitude: 139.0, kCGImagePropertyGPSLongitudeRef:"E"],
    kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment:"PRIVATE_FIXTURE"],
    kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake:"PRIVATE_CAMERA"]
  ] as CFDictionary)
  precondition(CGImageDestinationFinalize(destination))
} else {
  let source = CGImageSourceCreateWithURL(input as CFURL,nil)!
  let properties = CGImageSourceCopyPropertiesAtIndex(source,0,nil)! as NSDictionary
  precondition(properties[kCGImagePropertyGPSDictionary] == nil, "GPS survived")
  precondition(!properties.description.contains("PRIVATE_"), "Source metadata survived")
  precondition((properties[kCGImagePropertyPixelWidth] as? Int) == 40, "Orientation width wrong")
  precondition((properties[kCGImagePropertyPixelHeight] as? Int) == 70, "Orientation height wrong")
  print("Public photo fixture passed: orientation applied, GPS and private metadata removed.")
}
`);
  const renderer = path.join(dir, "render");
  execFileSync("xcrun", ["swiftc", path.join(__dirname, "render-public-photo.swift"), "-o", renderer], { stdio: "pipe" });
  execFileSync("swift", [fixture, "create", path.join(dir, "input.jpg")], { stdio: "pipe" });
  execFileSync(renderer, [path.join(dir, "input.jpg"), path.join(dir, "output.jpg")], { stdio: "pipe" });
  console.log(execFileSync("swift", [fixture, "check", path.join(dir, "output.jpg")], { encoding: "utf8" }).trim());
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
