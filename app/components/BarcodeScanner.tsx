"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string, format: string) => void;
  onScanError?: (error: string) => void;
}

// Detect iOS
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function BarcodeScanner({
  onScanSuccess,
  onScanError,
}: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [isIOSDevice] = useState(isIOS());
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Request camera permission and get camera list
  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      setDebugInfo("Requesting camera permission...");

      // First request permission with ideal constraints for barcode scanning
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((track) => track.stop());

      setDebugInfo("Permission granted, getting cameras...");

      // Get camera list
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setCameras(devices);
        setDebugInfo(`Found ${devices.length} cameras`);

        // Prefer back camera
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment")
        );
        // On iOS, usually the last camera is the back camera
        setSelectedCamera(backCamera?.id || devices[devices.length - 1].id);
        setHasPermission(true);
        setError(null);
      } else {
        setHasPermission(false);
        setError("No cameras found.");
      }
    } catch (err: any) {
      console.error("Camera permission error:", err);
      setHasPermission(false);
      setError(`Camera error: ${err.message || err.name}`);
      setDebugInfo(`Error: ${err.message}`);
    }
  };

  const startScanner = useCallback(async () => {
    if (!selectedCamera || !containerRef.current) return;

    // Cleanup existing scanner
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {}
    }

    try {
      setDebugInfo("Creating scanner...");

      const html5QrCode = new Html5Qrcode("barcode-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: true, // Enable verbose for debugging
      });

      scannerRef.current = html5QrCode;

      setDebugInfo("Starting camera...");

      // Use cameraIdOrConfig with specific constraints for iOS
      // On iOS, we need to use facingMode constraint, not device ID
      const cameraConfig = isIOSDevice
        ? { facingMode: "environment" } // Use facingMode for iOS
        : selectedCamera; // Use device ID for Android

      const scanConfig = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Dynamic qrbox that scales with screen
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.8);
          return {
            width: qrboxSize,
            height: Math.floor(qrboxSize * 0.5), // Make it wider for barcodes
          };
        },
        aspectRatio: 1.0, // Square aspect ratio works better on iOS
        disableFlip: false,
      };

      await html5QrCode.start(
        cameraConfig,
        scanConfig,
        (decodedText, decodedResult) => {
          const format = decodedResult.result.format?.formatName || "UNKNOWN";
          setDebugInfo(`Scanned: ${decodedText} (${format})`);
          onScanSuccess(decodedText, format);
        },
        (errorMessage) => {
          // This is called when no barcode is found in frame - ignore
          // Only log actual errors
          if (!errorMessage.includes("No MultiFormat Readers")) {
            // console.log("Scan frame:", errorMessage);
          }
        }
      );

      // Apply additional iOS fixes after camera starts
      setTimeout(() => {
        const video = document.querySelector(
          "#barcode-reader video"
        ) as HTMLVideoElement;
        if (video) {
          // Essential iOS video attributes
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          video.setAttribute("autoplay", "");
          video.playsInline = true;
          video.autoplay = true;
          video.muted = true;

          // Try to improve focus on iOS
          if (video.srcObject && "getTracks" in video.srcObject) {
            const stream = video.srcObject as MediaStream;
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              const capabilities = videoTrack.getCapabilities?.();
              setDebugInfo(
                `Video track: ${videoTrack.label}, Capabilities: ${
                  capabilities
                    ? JSON.stringify(Object.keys(capabilities))
                    : "N/A"
                }`
              );

              // Try to enable continuous autofocus if supported
              const caps = capabilities as any;
              if (caps?.focusMode?.includes("continuous")) {
                videoTrack.applyConstraints({
                  advanced: [{ focusMode: "continuous" }],
                } as any);
              }
            }
          }
        }
      }, 1000);

      setIsScanning(true);
      setError(null);
      setDebugInfo("Scanner running - point at barcode");
    } catch (err: any) {
      console.error("Error starting scanner:", err);
      setError(`Failed to start: ${err.message || err}`);
      setDebugInfo(`Start error: ${err.message}`);
      onScanError?.(`Failed to start scanner: ${err}`);
    }
  }, [selectedCamera, onScanSuccess, onScanError, isIOSDevice]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      setIsScanning(false);
      setDebugInfo("Scanner stopped");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  if (hasPermission === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent"></div>
        <span className="mt-3 text-gray-600">Requesting camera access...</span>
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-red-500 text-4xl mb-3">📷</div>
        <h3 className="text-red-700 font-semibold text-lg">
          Camera Access Required
        </h3>
        <p className="text-red-600 mt-2 text-sm">{error}</p>
        <button
          onClick={() => {
            setHasPermission(null);
            requestCameraPermission();
          }}
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Debug Info (can remove in production) */}
      <div className="bg-gray-100 rounded-lg p-2 text-xs font-mono text-gray-600 break-all">
        <strong>Debug:</strong> {debugInfo}
        <br />
        <strong>Device:</strong> {isIOSDevice ? "iOS" : "Other"} | Camera:{" "}
        {selectedCamera?.substring(0, 20)}...
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Camera Selection - Only show on non-iOS or when not scanning */}
      {cameras.length > 1 && !isScanning && !isIOSDevice && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Camera:</label>
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg bg-white"
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label || `Camera ${camera.id}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scanner Container */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ minHeight: "350px" }}
      >
        <div
          id="barcode-reader"
          className="w-full"
          style={{ minHeight: "350px" }}
        ></div>

        {!isScanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <div className="text-6xl mb-4">📷</div>
              <p className="text-gray-400">Tap button to start scanning</p>
            </div>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-3">
        {!isScanning ? (
          <button
            onClick={startScanner}
            className="flex-1 py-4 px-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl text-lg active:scale-95"
          >
            🎯 Start Scanning
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="flex-1 py-4 px-6 bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold rounded-xl text-lg active:scale-95"
          >
            ⏹️ Stop Scanning
          </button>
        )}
      </div>

      {/* Scanning Indicator */}
      {isScanning && (
        <div className="flex items-center justify-center gap-2 text-green-600">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">
            Scanning... Hold barcode steady in frame
          </span>
        </div>
      )}

      {/* iOS Tips */}
      {isIOSDevice && isScanning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <strong>📱 iOS Tips:</strong>
          <ul className="list-disc ml-4 mt-1">
            <li>Hold phone 6-12 inches from barcode</li>
            <li>Ensure good lighting</li>
            <li>Keep camera steady, let it focus</li>
            <li>Try tilting slightly if not detecting</li>
          </ul>
        </div>
      )}
    </div>
  );
}
