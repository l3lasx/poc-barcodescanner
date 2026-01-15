"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";

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
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("Initializing...");
  const [isIOSDevice] = useState(isIOS());

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  // Initialize and get cameras
  useEffect(() => {
    initializeScanner();

    return () => {
      stopScanner();
    };
  }, []);

  const initializeScanner = async () => {
    try {
      setDebugInfo("Requesting camera permission...");

      // Request permission first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      stream.getTracks().forEach((track) => track.stop());

      // Get camera list
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length === 0) {
        throw new Error("No cameras found");
      }

      setCameras(videoDevices);
      setDebugInfo(`Found ${videoDevices.length} camera(s)`);

      // Prefer back camera
      const backCamera = videoDevices.find(
        (d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
      );
      const defaultCamera =
        backCamera?.deviceId || videoDevices[videoDevices.length - 1].deviceId;
      setSelectedCamera(defaultCamera);
      setHasPermission(true);

      // Create reader instance
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      readerRef.current = new BrowserMultiFormatReader(hints, 500); // 500ms between scans
      setDebugInfo("Scanner ready");
    } catch (err: any) {
      console.error("Init error:", err);
      setHasPermission(false);
      setError(err.message || "Failed to access camera");
      setDebugInfo(`Error: ${err.message}`);
    }
  };

  const startScanner = useCallback(async () => {
    if (!videoRef.current || !readerRef.current) {
      setDebugInfo("Video or reader not ready");
      return;
    }

    try {
      setDebugInfo("Starting scanner...");
      setError(null);

      // Use decodeFromVideoDevice for continuous scanning
      // Pass null for deviceId to use default camera, or pass specific deviceId
      const deviceId = isIOSDevice ? null : selectedCamera || null;

      await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const format =
              BarcodeFormat[result.getBarcodeFormat()] || "UNKNOWN";
            const text = result.getText();
            setDebugInfo(`✅ Scanned: ${text} (${format})`);
            onScanSuccess(text, format);
          }
          if (err && !(err instanceof NotFoundException)) {
            // Only log real errors, not "barcode not found"
            console.log("Scan error:", err);
          }
        }
      );

      setIsScanning(true);
      setDebugInfo("Scanning... Point at barcode");
    } catch (err: any) {
      console.error("Start error:", err);
      setError(`Failed to start: ${err.message}`);
      setDebugInfo(`Error: ${err.message}`);
      onScanError?.(err.message);
    }
  }, [selectedCamera, onScanSuccess, onScanError, isIOSDevice]);

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      setDebugInfo("Scanner stopped");
    }
    setIsScanning(false);
  }, []);

  // Restart scanner when camera changes
  const handleCameraChange = async (newCameraId: string) => {
    setSelectedCamera(newCameraId);
    if (isScanning) {
      stopScanner();
      // Small delay before restarting
      setTimeout(() => {
        startScanner();
      }, 500);
    }
  };

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
            setError(null);
            initializeScanner();
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
      {/* Debug Info */}
      <div className="bg-gray-100 rounded-lg p-2 text-xs font-mono text-gray-600 break-all">
        <strong>Debug:</strong> {debugInfo}
        <br />
        <strong>Device:</strong> {isIOSDevice ? "iOS" : "Other"} | Library:
        ZXing
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Camera Selection */}
      {cameras.length > 1 && !isScanning && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Camera:</label>
          <select
            value={selectedCamera}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg bg-white"
          >
            {cameras.map((camera, idx) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Video Container */}
      <div
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ minHeight: "320px" }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ minHeight: "320px", display: isScanning ? "block" : "none" }}
          playsInline
          muted
          autoPlay
        />

        {/* Scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4/5 h-20 border-2 border-green-400 rounded-lg relative">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-400" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-400" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-400" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-400" />
              </div>
            </div>
          </div>
        )}

        {/* Placeholder when not scanning */}
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
            className="flex-1 py-4 px-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl text-lg active:scale-95 transition-transform"
          >
            🎯 Start Scanning
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="flex-1 py-4 px-6 bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold rounded-xl text-lg active:scale-95 transition-transform"
          >
            ⏹️ Stop Scanning
          </button>
        )}
      </div>

      {/* Scanning status */}
      {isScanning && (
        <div className="flex items-center justify-center gap-2 text-green-600">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">
            Scanning... Hold barcode in frame
          </span>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <strong>💡 Tips:</strong>
        <ul className="list-disc ml-4 mt-1">
          <li>Hold phone 6-12 inches from barcode</li>
          <li>Ensure good lighting (avoid shadows)</li>
          <li>Keep barcode flat and centered</li>
          <li>Wait for camera to focus</li>
        </ul>
      </div>
    </div>
  );
}
