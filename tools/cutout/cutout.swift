// cutout <input image> <output.png>
// Lifts the foreground subject out of a photograph with Apple's Vision framework
// (the same model as "Lift Subject" in Photos) and writes it as a PNG with alpha,
// cropped to the subject.
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: cutout <input> <output.png>\n".data(using: .utf8)!)
  exit(64)
}

do {
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: args[1]))
  let request = VNGenerateForegroundInstanceMaskRequest()
  try handler.perform([request])
  guard let result = request.results?.first, !result.allInstances.isEmpty else {
    FileHandle.standardError.write("no foreground subject found\n".data(using: .utf8)!)
    exit(2)
  }
  let masked = try result.generateMaskedImage(
    ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
  let image = CIImage(cvPixelBuffer: masked)
  try CIContext().writePNGRepresentation(
    of: image, to: URL(fileURLWithPath: args[2]), format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
} catch {
  FileHandle.standardError.write("cutout failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
