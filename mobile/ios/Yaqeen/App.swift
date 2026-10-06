import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = WebViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let web = WKWebView(frame: .zero)
    private var showingError = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        web.load(URLRequest(url: NavigationPolicy.appURL))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        // Subframe requests do not navigate the app's main document.
        if let frame = action.targetFrame, !frame.isMainFrame { decisionHandler(.allow); return }
        // ponytail: email/password demo; native Google session return needs browser callback integration.
        if NavigationPolicy.googleLogin(url) {
            decisionHandler(.cancel)
            let alert = UIAlertController(title: "Google sign-in",
                message: "Use email and password to stay in the mobile demo. You can also use Google in the full web app.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Use email", style: .cancel))
            alert.addAction(UIAlertAction(title: "Open web app", style: .default) { _ in
                UIApplication.shared.open(NavigationPolicy.appURL)
            })
            if presentedViewController == nil { present(alert, animated: true) }
            return
        }
        if NavigationPolicy.inApp(url) {
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if NavigationPolicy.external(url) { UIApplication.shared.open(url) }
        }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let components = URLComponents(string: "\(origin.protocol)://\(origin.host)")
        if type == .microphone, let url = components?.url, NavigationPolicy.inApp(url),
           origin.port == 0 || origin.port == 443 {
            decisionHandler(.prompt)
        } else { decisionHandler(.deny) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        connectionError(error)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        connectionError(error)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 400 {
            decisionHandler(.cancel)
            connectionError(NSError(domain: "YaqeenHTTP", code: http.statusCode))
        } else { decisionHandler(.allow) }
    }
    private func connectionError(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled, !showingError, presentedViewController == nil else { return }
        showingError = true
        let alert = UIAlertController(title: "Unable to load Yaqeen",
            message: "Check your connection and try again.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
            self?.showingError = false
            self?.web.load(URLRequest(url: NavigationPolicy.appURL))
        })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in self?.showingError = false })
        present(alert, animated: true)
    }
}
