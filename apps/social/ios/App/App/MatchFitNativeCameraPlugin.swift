
import Foundation
import Capacitor
import AVFoundation
import UIKit
import PhotosUI

// MARK: - Animation horizontale MatchFit
// La caméra entre depuis la GAUCHE et repart vers la GAUCHE.

private final class MatchFitSlideAnimator:
    NSObject, UIViewControllerAnimatedTransitioning {

    private let presenting: Bool

    init(presenting: Bool) {
        self.presenting = presenting
        super.init()
    }

    func transitionDuration(
        using context: UIViewControllerContextTransitioning?
    ) -> TimeInterval {
        return presenting ? 0.34 : 0.28
    }

    func animateTransition(
        using context: UIViewControllerContextTransitioning
    ) {
        let container = context.containerView
        let duration = transitionDuration(using: context)
        let width = container.bounds.width

        if presenting {
            guard let destination = context.view(
                forKey: .to
            ),
            let destinationController = context.viewController(
                forKey: .to
            ) else {
                context.completeTransition(false)
                return
            }

            let finalFrame = context.finalFrame(
                for: destinationController
            )

            // Entrée depuis la gauche
            destination.frame = finalFrame.offsetBy(
                dx: -width,
                dy: 0
            )

            container.addSubview(destination)

            UIView.animate(
                withDuration: duration,
                delay: 0,
                usingSpringWithDamping: 0.92,
                initialSpringVelocity: 0.3,
                options: [
                    .curveEaseOut,
                    .allowUserInteraction
                ],
                animations: {
                    destination.frame = finalFrame
                },
                completion: { _ in
                    context.completeTransition(
                        !context.transitionWasCancelled
                    )
                }
            )

        } else {
            guard let source = context.view(
                forKey: .from
            ) else {
                context.completeTransition(false)
                return
            }

            // Sortie vers la gauche
            UIView.animate(
                withDuration: duration,
                delay: 0,
                options: [
                    .curveEaseInOut,
                    .allowUserInteraction
                ],
                animations: {
                    source.transform = CGAffineTransform(
                        translationX: -width,
                        y: 0
                    )
                },
                completion: { _ in
                    source.transform = .identity
                    context.completeTransition(
                        !context.transitionWasCancelled
                    )
                }
            )
        }
    }
}

private final class MatchFitSlideTransitionDelegate:
    NSObject, UIViewControllerTransitioningDelegate {

    func animationController(
        forPresented presented: UIViewController,
        presenting: UIViewController,
        source: UIViewController
    ) -> UIViewControllerAnimatedTransitioning? {
        return MatchFitSlideAnimator(presenting: true)
    }

    func animationController(
        forDismissed dismissed: UIViewController
    ) -> UIViewControllerAnimatedTransitioning? {
        return MatchFitSlideAnimator(presenting: false)
    }
}

// MARK: - Plugin Capacitor

@objc(MatchFitNativeCameraPlugin)
public class MatchFitNativeCameraPlugin:
    CAPPlugin, CAPBridgedPlugin {

    public let identifier = "MatchFitNativeCameraPlugin"
    public let jsName = "MatchFitNativeCamera"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "checkCamera",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "openCamera",
            returnType: CAPPluginReturnPromise
        )
    ]

    @objc func checkCamera(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(
            for: .video
        )

        call.resolve([
            "available": AVCaptureDevice.default(
                for: .video
            ) != nil,
            "authorized": status == .authorized,
            "status": String(describing: status)
        ])
    }

    @objc func openCamera(_ call: CAPPluginCall) {
        guard AVCaptureDevice.default(
            for: .video
        ) != nil else {
            call.reject("Aucune caméra disponible")
            return
        }

        // L'animation horizontale est activée par App.tsx
        // avec transition: "horizontal".
        let horizontal = call.getString("transition")
            == "horizontal"

        let presentCamera = { [weak self] in
            DispatchQueue.main.async {
                guard let self = self,
                      let presenter = self.bridge?.viewController
                else {
                    call.reject("Caméra indisponible")
                    return
                }

                let controller =
                    MatchFitPhotoCameraViewController()

                controller.modalPresentationStyle = .fullScreen

                if horizontal {
                    controller.enableHorizontalTransition()
                }

                controller.onResult = { result in
                    switch result {
                    case .success(let media):
                        call.resolve([
                            "path": media.url.absoluteString,
                            "name": media.url.lastPathComponent,
                            "mimeType": media.mimeType,
                            "mode": media.mode
                        ])

                    case .failure(let error):
                        call.reject(error.localizedDescription)
                    }
                }

                controller.onCancel = {
                    call.reject(
                        "CAMERA_CANCELLED",
                        "CAMERA_CANCELLED"
                    )
                }

                presenter.present(
                    controller,
                    animated: true
                )
            }
        }

        switch AVCaptureDevice.authorizationStatus(
            for: .video
        ) {
        case .authorized:
            presentCamera()

        case .notDetermined:
            AVCaptureDevice.requestAccess(
                for: .video
            ) { granted in
                if granted {
                    presentCamera()
                } else {
                    call.reject("Accès caméra refusé")
                }
            }

        default:
            call.reject(
                "Autorise la caméra dans Réglages > MatchFit"
            )
        }
    }
}

// MARK: - Résultat média

private struct MatchFitMedia {
    let url: URL
    let mimeType: String
    let mode: String
}

// MARK: - Caméra native MatchFit

private final class MatchFitPhotoCameraViewController:
    UIViewController,
    AVCapturePhotoCaptureDelegate,
    PHPickerViewControllerDelegate {

    var onResult: ((Result<MatchFitMedia, Error>) -> Void)?
    var onCancel: (() -> Void)?

    private let slideTransition =
        MatchFitSlideTransitionDelegate()

    func enableHorizontalTransition() {
        modalPresentationStyle = .custom
        transitioningDelegate = slideTransition
    }

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()

    private let sessionQueue = DispatchQueue(
        label: "org.matchfit.camera.session"
    )

    private var previewLayer: AVCaptureVideoPreviewLayer?

    private var currentPosition:
        AVCaptureDevice.Position = .back

    private var flashEnabled = false
    private var busy = false
    private var completed = false
    private var selectedMode = "story"

    private let shutter = UIButton(type: .custom)
    private let galleryButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)

    private let modeControl = UISegmentedControl(
        items: ["Story", "Réel", "Publication"]
    )

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black

        let preview = AVCaptureVideoPreviewLayer(
            session: session
        )

        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview

        let close = makeButton(
            "✕",
            action: #selector(cancel)
        )

        let flip = makeButton(
            "↻",
            action: #selector(flipCamera)
        )

        let title = UILabel()
        title.text = "MATCHFIT"
        title.textColor = .white
        title.font = .systemFont(
            ofSize: 18,
            weight: .heavy
        )

        flashButton.setTitle(
            "⚡︎ Off",
            for: .normal
        )
        flashButton.setTitleColor(
            .white,
            for: .normal
        )
        flashButton.titleLabel?.font = .systemFont(
            ofSize: 17,
            weight: .semibold
        )
        flashButton.addTarget(
            self,
            action: #selector(toggleFlash),
            for: .touchUpInside
        )

        galleryButton.setTitle(
            "▧",
            for: .normal
        )
        galleryButton.setTitleColor(
            .white,
            for: .normal
        )
        galleryButton.titleLabel?.font = .systemFont(
            ofSize: 35
        )
        galleryButton.backgroundColor = UIColor(
            white: 0.15,
            alpha: 0.8
        )
        galleryButton.layer.cornerRadius = 12
        galleryButton.layer.borderWidth = 1.5
        galleryButton.layer.borderColor =
            UIColor.white.cgColor
        galleryButton.accessibilityLabel = "Photothèque"
        galleryButton.addTarget(
            self,
            action: #selector(openGallery),
            for: .touchUpInside
        )

        shutter.backgroundColor = .white
        shutter.layer.cornerRadius = 36
        shutter.layer.borderWidth = 5
        shutter.layer.borderColor = UIColor(
            white: 0.8,
            alpha: 1
        ).cgColor
        shutter.accessibilityLabel = "Prendre une photo"
        shutter.addTarget(
            self,
            action: #selector(takePhoto),
            for: .touchUpInside
        )

        modeControl.selectedSegmentIndex = 0
        modeControl.selectedSegmentTintColor = UIColor(
            red: 1,
            green: 0.52,
            blue: 0.29,
            alpha: 1
        )
        modeControl.backgroundColor = UIColor(
            white: 0.12,
            alpha: 0.85
        )
        modeControl.setTitleTextAttributes(
            [.foregroundColor: UIColor.white],
            for: .normal
        )
        modeControl.setTitleTextAttributes(
            [.foregroundColor: UIColor.black],
            for: .selected
        )
        modeControl.addTarget(
            self,
            action: #selector(changeMode),
            for: .valueChanged
        )

        [
            close,
            flip,
            flashButton,
            galleryButton,
            shutter,
            title,
            modeControl
        ].forEach {
            view.addSubview($0)
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            close.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 20
            ),
            close.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.topAnchor,
                constant: 12
            ),

            title.centerXAnchor.constraint(
                equalTo: view.centerXAnchor
            ),
            title.centerYAnchor.constraint(
                equalTo: close.centerYAnchor
            ),

            flashButton.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -18
            ),
            flashButton.centerYAnchor.constraint(
                equalTo: close.centerYAnchor
            ),

            shutter.centerXAnchor.constraint(
                equalTo: view.centerXAnchor
            ),
            shutter.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -28
            ),
            shutter.widthAnchor.constraint(
                equalToConstant: 72
            ),
            shutter.heightAnchor.constraint(
                equalToConstant: 72
            ),

            modeControl.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 22
            ),
            modeControl.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -22
            ),
            modeControl.bottomAnchor.constraint(
                equalTo: shutter.topAnchor,
                constant: -22
            ),
            modeControl.heightAnchor.constraint(
                equalToConstant: 38
            ),

            galleryButton.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 25
            ),
            galleryButton.centerYAnchor.constraint(
                equalTo: shutter.centerYAnchor
            ),
            galleryButton.widthAnchor.constraint(
                equalToConstant: 58
            ),
            galleryButton.heightAnchor.constraint(
                equalToConstant: 58
            ),

            flip.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -25
            ),
            flip.centerYAnchor.constraint(
                equalTo: shutter.centerYAnchor
            )
        ])

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            self.configureSession(position: .back)
            self.session.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if !self.session.isRunning {
                self.session.startRunning()
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if self.session.isRunning {
                self.session.stopRunning()
            }
        }
    }

    private func makeButton(
        _ title: String,
        action: Selector
    ) -> UIButton {
        let button = UIButton(type: .system)

        button.setTitle(title, for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.titleLabel?.font = .systemFont(
            ofSize: 30,
            weight: .medium
        )
        button.addTarget(
            self,
            action: action,
            for: .touchUpInside
        )

        return button
    }

    private func configureSession(
        position: AVCaptureDevice.Position
    ) {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        session.sessionPreset = .photo

        for input in session.inputs {
            session.removeInput(input)
        }

        guard let device = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: position
        ),
        let input = try? AVCaptureDeviceInput(
            device: device
        ),
        session.canAddInput(input) else {
            return
        }

        session.addInput(input)

        if !session.outputs.contains(photoOutput),
           session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
    }

    @objc private func flipCamera() {
        currentPosition =
            currentPosition == .back ? .front : .back

        let position = currentPosition

        sessionQueue.async { [weak self] in
            self?.configureSession(position: position)
        }
    }

    @objc private func toggleFlash() {
        flashEnabled.toggle()

        flashButton.setTitle(
            flashEnabled ? "⚡︎ On" : "⚡︎ Off",
            for: .normal
        )
    }

    @objc private func changeMode() {
        let modes = ["story", "reel", "publication"]
        let index = modeControl.selectedSegmentIndex

        if modes.indices.contains(index) {
            selectedMode = modes[index]
        }
    }

    @objc private func takePhoto() {
        guard !busy, !completed else { return }

        busy = true
        shutter.isEnabled = false

        let useFlash = flashEnabled

        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            let settings = AVCapturePhotoSettings()

            if self.photoOutput.supportedFlashModes
                .contains(.on) {
                settings.flashMode =
                    useFlash ? .on : .off
            }

            self.photoOutput.capturePhoto(
                with: settings,
                delegate: self
            )
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        if let error = error {
            finish(.failure(error))
            return
        }

        guard let data =
            photo.fileDataRepresentation() else {
            finish(.failure(cameraError(
                "Photo indisponible"
            )))
            return
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "matchfit-\(UUID().uuidString).jpg"
            )

        do {
            try data.write(
                to: url,
                options: .atomic
            )

            finish(.success(MatchFitMedia(
                url: url,
                mimeType: "image/jpeg",
                mode: selectedMode
            )))
        } catch {
            finish(.failure(error))
        }
    }

    @objc private func openGallery() {
        guard !busy, !completed else { return }

        var configuration = PHPickerConfiguration(
            photoLibrary: .shared()
        )

        configuration.filter = .images
        configuration.selectionLimit = 1

        let picker = PHPickerViewController(
            configuration: configuration
        )
        picker.delegate = self

        present(picker, animated: true)
    }

    func picker(
        _ picker: PHPickerViewController,
        didFinishPicking results: [PHPickerResult]
    ) {
        picker.dismiss(animated: true)

        guard let item = results.first?.itemProvider else {
            return
        }

        guard item.canLoadObject(
            ofClass: UIImage.self
        ) else {
            finish(.failure(cameraError(
                "Image non prise en charge"
            )))
            return
        }

        item.loadObject(ofClass: UIImage.self) {
            [weak self] object, error in

            if let error = error {
                self?.finish(.failure(error))
                return
            }

            guard let image = object as? UIImage,
                  let data = image.jpegData(
                    compressionQuality: 0.95
                  ) else {
                self?.finish(.failure(
                    self?.cameraError(
                        "Impossible de lire l'image"
                    ) ?? NSError(
                        domain: "MatchFitCamera",
                        code: 3
                    )
                ))
                return
            }

            let url = FileManager.default
                .temporaryDirectory
                .appendingPathComponent(
                    "matchfit-gallery-\(UUID().uuidString).jpg"
                )

            do {
                try data.write(
                    to: url,
                    options: .atomic
                )

                self?.finish(.success(MatchFitMedia(
                    url: url,
                    mimeType: "image/jpeg",
                    mode: self?.selectedMode ?? "story"
                )))
            } catch {
                self?.finish(.failure(error))
            }
        }
    }

    private func cameraError(
        _ message: String
    ) -> NSError {
        NSError(
            domain: "MatchFitCamera",
            code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: message
            ]
        )
    }

    private func finish(
        _ result: Result<MatchFitMedia, Error>
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  !self.completed else {
                return
            }

            self.completed = true

            self.dismiss(animated: true) {
                self.onResult?(result)
            }
        }
    }

    @objc private func cancel() {
        guard !completed else { return }

        completed = true

        dismiss(animated: true) { [weak self] in
            self?.onCancel?()
        }
    }
}

