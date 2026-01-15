"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
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
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize reader and get cameras
  useEffect(() => {
    initializeScanner();

    return () => {
      stopScanner();
    };
  }, []);

  const initializeScanner = async () => {
    try {
      setDebugInfo("Requesting camera permission...");

      // First request permission
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
      setDebugInfo(`Found ${videoDevices.length} cameras`);

      // Prefer back camera
      const backCamera = videoDevices.find(
        (d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
      );
      setSelectedCamera(
        backCamera?.deviceId || videoDevices[videoDevices.length - 1].deviceId
      );
      setHasPermission(true);
    } catch (err: any) {
      console.error("Init error:", err);
      setHasPermission(false);
      setError(err.message || "Failed to access camera");
      setDebugInfo(`Error: ${err.message}`);
    }
  };

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      setDebugInfo("Starting ZXing scanner...");

      // Create hints for barcode formats
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

      // Create reader
      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      // Get video constraints
      const constraints: MediaStreamConstraints = {
        video: isIOSDevice
          ? {
              facingMode: { exact: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      };

      setDebugInfo("Getting camera stream...");

      // Get stream manually for more control
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Attach stream to video
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(resolve);
        };
      });

      setDebugInfo("Video ready, starting decode loop...");
      setIsScanning(true);

      // Start continuous decode
      const decodeLoop = async () => {
        if (
          !readerRef.current ||
          !videoRef.current ||
          !streamRef.current?.active
        ) {
          return;
        }

        try {
          const result = await readerRef.current.decodeOnce(videoRef.current);
          if (result) {
            const format =
              BarcodeFormat[result.getBarcodeFormat()] || "UNKNOWN";
            const text = result.getText();
            setDebugInfo(`Scanned: ${text} (${format})`);
            onScanSuccess(text, format);
          }
        } catch (err: any) {
          // NotFoundException is normal when no barcode in frame
          if (err.name !== "NotFoundException") {
            console.log("Decode error:", err.name);
          }
        }

        // Continue scanning
        if (streamRef.current?.active) {
          requestAnimationFrame(decodeLoop);
        }
      };

      // Start the decode loop
      decodeLoop();
    } catch (err: any) {
      console.error("Start error:", err);
      setError(err.message || "Failed to start scanner");
      setDebugInfo(`Start error: ${err.message}`);
      onScanError?.(err.message);

      // Try fallback for iOS - use facingMode without exact
      if (isIOSDevice && err.name === "OverconstrainedError") {
        setDebugInfo("Trying fallback constraints...");
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
            setIsScanning(true);
            setError(null);
          }
        } catch (fallbackErr) {
          console.error("Fallback failed:", fallbackErr);
        }
      }
    }
  }, [selectedCamera, onScanSuccess, onScanError, isIOSDevice]);

  const stopScanner = useCallback(() => {
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Reset reader
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }

    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
    setDebugInfo("Scanner stopped");
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
        <strong>Device:</strong> {isIOSDevice ? "iOS" : "Other"} | Lib: ZXing
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
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg bg-white"
          >
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${camera.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Video Container */}
      <div
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ minHeight: "350px" }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ minHeight: "350px" }}
          playsInline
          muted
          autoPlay
        />

        {/* Scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Scan frame */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4/5 h-24 border-2 border-green-400 rounded-lg relative">
                {/* Scanning line animation */}
                <div
                  className="absolute inset-x-0 top-0 h-0.5 bg-green-400 animate-pulse"
                  style={{ animation: "scanLine 2s linear infinite" }}
                />
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-400 rounded-br" />
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
            Scanning with ZXing... Hold barcode steady
          </span>
        </div>
      )}

      {/* Tips */}
      {isScanning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <strong>� Tips:</strong>
          <ul className="list-disc ml-4 mt-1">
            <li>Hold phone 6-12 inches from barcode</li>
            <li>Ensure good lighting</li>
            <li>Keep barcode centered in frame</li>
            <li>Hold steady and let camera focus</li>
          </ul>
        </div>
      )}
    </div>
  );
}
