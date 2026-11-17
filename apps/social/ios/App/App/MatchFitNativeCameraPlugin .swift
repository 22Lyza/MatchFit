//
//  MatchFitNativeCameraPlugin 2.swift
//  App
//
//  Created by Le Basque on 17.11.2026.
//



import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(MatchFitNativeCameraPlugin)
public class MatchFitNativeCameraPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "MatchFitNativeCameraPlugin"
    public let jsName = "MatchFitNativeCamera"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkCamera", returnType: CAPPluginReturnPromise)
    ]

    @objc func checkCamera(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)

        call.resolve([
            "available": AVCaptureDevice.default(for: .video) != nil,
            "authorized": status == .authorized,
            "status": String(describing: status)
        ])
    }
}
