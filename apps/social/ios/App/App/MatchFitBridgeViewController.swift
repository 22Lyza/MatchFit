import UIKit
import Capacitor

class MatchFitBridgeViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MatchFitNativeCameraPlugin())
    }
}
