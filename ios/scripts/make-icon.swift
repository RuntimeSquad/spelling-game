import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let context = CGContext(data:nil,width:1024,height:1024,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue)!
func color(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat) { context.setFillColor(CGColor(red:r,green:g,blue:b,alpha:1)) }
color(0.91,0.95,0.85);context.fill(CGRect(x:0,y:0,width:1024,height:1024));color(0.98,0.92,0.69);context.fillEllipse(in:CGRect(x:100,y:100,width:824,height:824));color(1,1,0.96);context.fillEllipse(in:CGRect(x:270,y:460,width:250,height:360));context.fillEllipse(in:CGRect(x:510,y:460,width:250,height:360));color(0.93,0.70,0.29);context.fillEllipse(in:CGRect(x:190,y:220,width:660,height:400));context.saveGState();context.addEllipse(in:CGRect(x:190,y:220,width:660,height:400));context.clip();color(0.13,0.25,0.19);context.fill(CGRect(x:350,y:200,width:70,height:450));context.fill(CGRect(x:510,y:200,width:70,height:450));context.restoreGState();color(0.13,0.25,0.19);context.fillEllipse(in:CGRect(x:690,y:470,width:40,height:40));context.fillEllipse(in:CGRect(x:780,y:470,width:40,height:40))
let directory = URL(fileURLWithPath:CommandLine.arguments[1]); try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
let image = context.makeImage()!;let destination = CGImageDestinationCreateWithURL(directory.appending(path:"AppIcon.png") as CFURL,UTType.png.identifier as CFString,1,nil)!;CGImageDestinationAddImage(destination,image,nil);CGImageDestinationFinalize(destination)
let contents = "{\"images\":[{\"filename\":\"AppIcon.png\",\"idiom\":\"universal\",\"platform\":\"ios\",\"size\":\"1024x1024\"}],\"info\":{\"author\":\"xcode\",\"version\":1}}";try contents.write(to:directory.appending(path:"Contents.json"),atomically:true,encoding:.utf8)
try "{\"info\":{\"author\":\"xcode\",\"version\":1}}".write(to:directory.deletingLastPathComponent().appending(path:"Contents.json"),atomically:true,encoding:.utf8)
