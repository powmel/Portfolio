import AppKit
import SwiftUI
import WebKit

@MainActor
final class ReviewAppDelegate: NSObject, NSApplicationDelegate {
    private var server: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        let root = Bundle.main.bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/node")
        process.arguments = [root.appendingPathComponent("scripts/media-admin-server.js").path]
        process.currentDirectoryURL = root
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
        server = process
    }

    func applicationWillTerminate(_ notification: Notification) {
        if server?.isRunning == true {
            server?.terminate()
        }
    }
}

struct ReviewWebView: NSViewRepresentable {
    final class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?
        var attempts = 0

        func load() {
            guard let webView else { return }
            webView.load(URLRequest(url: URL(string: "http://127.0.0.1:4173/admin/media.html")!))
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard attempts < 20 else { return }
            attempts += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in self?.load() }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            context.coordinator.load()
        }
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

@main
struct TaikiPhotoReviewApp: App {
    @NSApplicationDelegateAdaptor(ReviewAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup("Taiki Photo Review") {
            ReviewWebView()
                .frame(minWidth: 390, minHeight: 720)
        }
        .defaultSize(width: 430, height: 820)
        .windowResizability(.contentMinSize)
    }
}
