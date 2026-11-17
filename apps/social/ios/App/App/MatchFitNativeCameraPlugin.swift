
import Foundation
import Capacitor
import AVFoundation
import UIKit
import PhotosUI

@objc(MatchFitNativeCameraPlugin)
public class MatchFitNativeCameraPlugin: CAPPlugin, CAPBridgedPlugin {

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
        let status = AVCaptureDevice.authorizationStatus(for: .video)

        call.resolve([
            "available": AVCaptureDevice.default(for: .video) != nil,
            "authorized": status == .authorized,
            "status": String(describing: status)
        ])
    }

    @objc func openCamera(_ call: CAPPluginCall) {
        guard AVCaptureDevice.default(for: .video) != nil else {
            call.reject("Aucune caméra disponible")
            return
        }

        let presentCamera = { [weak self] in
            DispatchQueue.main.async {
                guard let self = self,
                      let presenter = self.bridge?.viewController else {
                    call.reject("Caméra indisponible")
                    return
                }

                let controller = MatchFitPhotoCameraViewController()
                controller.modalPresentationStyle = .fullScreen

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
                    call.reject("CAMERA_CANCELLED", "CAMERA_CANCELLED")
                }

                presenter.present(controller, animated: true)
            }
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            presentCamera()

        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    presentCamera()
                } else {
                    call.reject("Accès caméra refusé")
                }
            }

        default:
            call.reject("Autorise la caméra dans Réglages > MatchFit")
        }
    }
}

private struct MatchFitMedia {
    let url: URL
    let mimeType: String
    let mode: String
}

private final class MatchFitPhotoCameraViewController:
    UIViewController,
    AVCapturePhotoCaptureDelegate,
    PHPickerViewControllerDelegate {

    var onResult: ((Result<MatchFitMedia, Error>) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(
        label: "org.matchfit.camera.session"
    )

    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var currentPosition: AVCaptureDevice.Position = .back

    private var flashEnabled = false
    private var busy = false
    private var completed = false

    private var selectedMode = "story"

    private let shutter = UIButton(type: .custom)
    private let galleryButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)

    private let storyButton = UIButton(type: .system)
    private let reelButton = UIButton(type: .system)
    private let publicationButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview

        let close = makeButton("✕", action: #selector(cancel))
        let flip = makeButton("↻", action: #selector(flipCamera))

        let title = UILabel()
        title.text = "MATCHFIT"
        title.textColor = .white
        title.font = .systemFont(ofSize: 18, weight: .heavy)

        flashButton.setTitle("⚡︎ Off", for: .normal)
        flashButton.setTitleColor(.white, for: .normal)
        flashButton.titleLabel?.font = .systemFont(
            ofSize: 17,
            weight: .semibold
        )
        flashButton.addTarget(
            self,
            action: #selector(toggleFlash),
            for: .touchUpInside
        )

        galleryButton.setTitle("▧", for: .normal)
        galleryButton.setTitleColor(.white, for: .normal)
        galleryButton.titleLabel?.font = .systemFont(ofSize: 35)
        galleryButton.backgroundColor = UIColor(
            white: 0.15,
            alpha: 0.8
        )
        galleryButton.layer.cornerRadius = 12
        galleryButton.layer.borderWidth = 1.5
        galleryButton.layer.borderColor = UIColor.white.cgColor
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

        configureModeButton(storyButton, title: "STORY", tag: 0)
        configureModeButton(reelButton, title: "RÉEL", tag: 1)
        configureModeButton(
            publicationButton,
            title: "PUBLICATION",
            tag: 2
        )

        let modeStack = UIStackView(arrangedSubviews: [
            storyButton,
            reelButton,
            publicationButton
        ])
        modeStack.axis = .horizontal
        modeStack.alignment = .center
        modeStack.distribution = .fillEqually
        modeStack.spacing = 12

        [
            close,
            flip,
            flashButton,
            galleryButton,
            shutter,
            title,
            modeStack
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

            modeStack.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 20
            ),
            modeStack.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -20
            ),
            modeStack.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -8
            ),
            modeStack.heightAnchor.constraint(equalToConstant: 40),

            shutter.centerXAnchor.constraint(
                equalTo: view.centerXAnchor
            ),
            shutter.bottomAnchor.constraint(
                equalTo: modeStack.topAnchor,
                constant: -18
            ),
            shutter.widthAnchor.constraint(equalToConstant: 72),
            shutter.heightAnchor.constraint(equalToConstant: 72),

            galleryButton.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: 25
            ),
            galleryButton.centerYAnchor.constraint(
                equalTo: shutter.centerYAnchor
            ),
            galleryButton.widthAnchor.constraint(equalToConstant: 58),
            galleryButton.heightAnchor.constraint(equalToConstant: 58),

            flip.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -25
            ),
            flip.centerYAnchor.constraint(
                equalTo: shutter.centerYAnchor
            )
        ])

        updateModeAppearance()

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

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if self.session.isRunning {
                self.session.stopRunning()
            }
        }
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

    private func configureModeButton(
        _ button: UIButton,
        title: String,
        tag: Int
    ) {
        button.setTitle(title, for: .normal)
        button.tag = tag
        button.titleLabel?.font = .systemFont(
            ofSize: 13,
            weight: .bold
        )
        button.addTarget(
            self,
            action: #selector(changeMode(_:)),
            for: .touchUpInside
        )
    }

    @objc private func changeMode(_ sender: UIButton) {
        switch sender.tag {
        case 1:
            selectedMode = "reel"
        case 2:
            selectedMode = "publication"
        default:
            selectedMode = "story"
        }

        updateModeAppearance()
    }

    private func updateModeAppearance() {
        let buttons: [(UIButton, String)] = [
            (storyButton, "story"),
            (reelButton, "reel"),
            (publicationButton, "publication")
        ]

        for (button, mode) in buttons {
            let selected = mode == selectedMode

            button.setTitleColor(
                selected
                    ? UIColor(red: 1, green: 0.54, blue: 0.29, alpha: 1)
                    : .white,
                for: .normal
            )

            button.alpha = selected ? 1 : 0.65
        }

        shutter.accessibilityLabel =
            "Prendre une photo pour \(selectedMode)"
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
        let input = try? AVCaptureDeviceInput(device: device),
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
        currentPosition = currentPosition == .back ? .front : .back
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

    @objc private func takePhoto() {
        guard !busy, !completed else { return }

        busy = true
        shutter.isEnabled = false
        let useFlash = flashEnabled

        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            let settings = AVCapturePhotoSettings()

            if self.photoOutput.supportedFlashModes.contains(.on) {
                settings.flashMode = useFlash ? .on : .off
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

        guard let data = photo.fileDataRepresentation() else {
            finish(.failure(NSError(
                domain: "MatchFitCamera",
                code: 1,
                userInfo: [
                    NSLocalizedDescriptionKey: "Photo indisponible"
                ]
            )))
            return
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "matchfit-\(UUID().uuidString).jpg"
            )

        do {
            try data.write(to: url, options: .atomic)

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

        guard item.canLoadObject(ofClass: UIImage.self) else {
            finish(.failure(NSError(
                domain: "MatchFitCamera",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey: "Image non prise en charge"
                ]
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
                self?.finish(.failure(NSError(
                    domain: "MatchFitCamera",
                    code: 3,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Impossible de lire l'image"
                    ]
                )))
                return
            }

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(
                    "matchfit-gallery-\(UUID().uuidString).jpg"
                )

            do {
                try data.write(to: url, options: .atomic)

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

    private func finish(
        _ result: Result<MatchFitMedia, Error>
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.completed else {
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

