import UIKit
import Capacitor

/// Custom bridge view controller that forces the webView to start at the
/// very top of the screen (y=0), eliminating the sub-pixel gap that the
/// StatusBar plugin's resizeWebView() can introduce on certain iPhone models.
class MyViewController: CAPBridgeViewController {

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // The StatusBar plugin runs its resizeWebView() on capacitorViewDidAppear
        // with a 0.1s delay. We schedule our fix after that completes.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.forceFullScreenWebView()
        }
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self?.forceFullScreenWebView()
            }
        }
    }

    private func forceFullScreenWebView() {
        guard let webView = self.webView else { return }
        if webView.frame.origin.y != 0 {
            var frame = webView.frame
            let offset = frame.origin.y
            frame.origin.y = 0
            frame.size.height += offset
            webView.frame = frame
        }
    }
}
