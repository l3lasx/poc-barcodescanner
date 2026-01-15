"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Quagga from "@ericblade/quagga2";
import jsQR from "jsqr";

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
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("Initializing...");
  const [lastCode, setLastCode] = useState<string>("");
  const [scanMode, setScanMode] = useState<"barcode" | "qrcode" | "both">(
    "both"
  );
  const [isIOSDevice] = useState(isIOS());

  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCodeRef = useRef<string>("");
  const lastCodeTimeRef = useRef<number>(0);
  const qrAnimationRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Check camera permission on mount
  useEffect(() => {
    checkPermission();

    return () => {
      stopScanner();
    };
  }, []);

  const checkPermission = async () => {
    try {
      setDebugInfo("Checking camera permission...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
      setDebugInfo("Camera permission granted");
    } catch (err: any) {
      console.error("Permission error:", err);
      setHasPermission(false);
      setError(err.message || "Camera access denied");
      setDebugInfo(`Error: ${err.message}`);
    }
  };

  // Handle successful scan with debounce
  const handleScanResult = useCallback(
    (code: string, format: string) => {
      const now = Date.now();
      // Debounce: ignore same code within 2 seconds
      if (
        code &&
        (code !== lastCodeRef.current || now - lastCodeTimeRef.current > 2000)
      ) {
        lastCodeRef.current = code;
        lastCodeTimeRef.current = now;
        setLastCode(code);
        setDebugInfo(`✅ Detected: ${code} (${format})`);
        onScanSuccess(code, format);

        // Vibrate feedback
        try {
          if (navigator.vibrate) navigator.vibrate(100);
        } catch {}
      }
    },
    [onScanSuccess]
  );

  // QR Code scanning using jsQR
  const startQRScanner = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const scanFrame = () => {
        if (
          !videoRef.current ||
          !canvasRef.current ||
          !streamRef.current?.active
        ) {
          return;
        }

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qrCode = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
              inversionAttempts: "dontInvert",
            }
          );

          if (qrCode) {
            handleScanResult(qrCode.data, "QR_CODE");
          }
        }

        qrAnimationRef.current = requestAnimationFrame(scanFrame);
      };

      qrAnimationRef.current = requestAnimationFrame(scanFrame);
      setDebugInfo("QR Scanner running...");
    } catch (err: any) {
      console.error("QR Scanner error:", err);
      setError(`QR Scanner error: ${err.message}`);
    }
  }, [handleScanResult]);

  const stopQRScanner = useCallback(() => {
    if (qrAnimationRef.current) {
      cancelAnimationFrame(qrAnimationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Barcode scanning using Quagga2
  const startBarcodeScanner = useCallback(async () => {
    if (!scannerRef.current) return;

    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerRef.current,
        constraints: {
          facingMode: "environment",
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
      },
      locator: {
        patchSize: "medium",
        halfSample: true,
      },
      numOfWorkers: navigator.hardwareConcurrency || 4,
      frequency: 10,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
          "code_128_reader",
          "code_39_reader",
        ],
      },
      locate: true,
    };

    await new Promise<void>((resolve, reject) => {
      Quagga.init(config as any, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    Quagga.onDetected((result) => {
      if (result && result.codeResult && result.codeResult.code) {
        handleScanResult(
          result.codeResult.code,
          result.codeResult.format || "BARCODE"
        );
      }
    });

    Quagga.start();
    setDebugInfo("Barcode Scanner running...");
  }, [handleScanResult]);

  const stopBarcodeScanner = useCallback(() => {
    try {
      Quagga.stop();
      Quagga.offDetected();
    } catch {}
  }, []);

  // Main start/stop functions
  const startScanner = useCallback(async () => {
    try {
      setDebugInfo(`Starting ${scanMode} scanner...`);
      setError(null);

      if (scanMode === "qrcode") {
        await startQRScanner();
      } else if (scanMode === "barcode") {
        await startBarcodeScanner();
      } else {
        // Both mode - use QR scanner with jsQR + Quagga for barcode
        // For simplicity, start QR scanner which can also try to detect
        await startBarcodeScanner();
        // Note: For "both" mode, you might want to periodically switch or run parallel
      }

      setIsScanning(true);
      setDebugInfo(`Scanning (${scanMode})... Point at code`);
    } catch (err: any) {
      console.error("Scanner start error:", err);
      setError(`Failed to start: ${err.message || err}`);
      setDebugInfo(`Error: ${err.message || err}`);
      onScanError?.(err.message);
    }
  }, [scanMode, startQRScanner, startBarcodeScanner, onScanError]);

  const stopScanner = useCallback(() => {
    stopQRScanner();
    stopBarcodeScanner();
    setIsScanning(false);
    setDebugInfo("Scanner stopped");
  }, [stopQRScanner, stopBarcodeScanner]);

  // Restart when mode changes
  const handleModeChange = (mode: "barcode" | "qrcode" | "both") => {
    if (isScanning) {
      stopScanner();
    }
    setScanMode(mode);
  };

  if (hasPermission === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent"></div>
        <span className="mt-3 text-gray-600">Checking camera access...</span>
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
            checkPermission();
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
      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => handleModeChange("barcode")}
          disabled={isScanning}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
            scanMode === "barcode"
              ? "bg-green-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          } ${isScanning ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          📊 Barcode
        </button>
        <button
          onClick={() => handleModeChange("qrcode")}
          disabled={isScanning}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
            scanMode === "qrcode"
              ? "bg-green-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          } ${isScanning ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          ⬛ QR Code
        </button>
        <button
          onClick={() => handleModeChange("both")}
          disabled={isScanning}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
            scanMode === "both"
              ? "bg-green-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          } ${isScanning ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          🔄 Both
        </button>
      </div>

      {/* Debug Info */}
      <div className="bg-gray-100 rounded-lg p-2 text-xs font-mono text-gray-600 break-all">
        <strong>Debug:</strong> {debugInfo}
        <br />
        <strong>Mode:</strong> {scanMode} | <strong>Device:</strong>{" "}
        {isIOSDevice ? "iOS" : "Other"}
        {lastCode && (
          <>
            <br />
            <strong>Last code:</strong> {lastCode}
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Scanner Container */}
      <div
        className="relative bg-black rounded-xl overflow-hidden"
        style={{ minHeight: "320px" }}
      >
        {/* Quagga container for barcode */}
        <div
          ref={scannerRef}
          id="scanner-container"
          className="w-full"
          style={{
            minHeight: "320px",
            display: isScanning && scanMode !== "qrcode" ? "block" : "none",
          }}
        />

        {/* Video for QR code */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{
            minHeight: "320px",
            display: isScanning && scanMode === "qrcode" ? "block" : "none",
          }}
          playsInline
          muted
          autoPlay
        />

        {/* Hidden canvas for QR processing */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={`border-2 border-green-400 rounded-lg relative ${
                  scanMode === "qrcode" ? "w-48 h-48" : "w-4/5 h-20"
                }`}
              >
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
              <div className="text-6xl mb-4">
                {scanMode === "qrcode" ? "⬛" : "📷"}
              </div>
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
            Scanning{" "}
            {scanMode === "qrcode"
              ? "QR Code"
              : scanMode === "barcode"
              ? "Barcode"
              : "Both"}
            ...
          </span>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <strong>💡 Tips:</strong>
        <ul className="list-disc ml-4 mt-1">
          {scanMode === "qrcode" ? (
            <>
              <li>Center QR code in the square frame</li>
              <li>Hold steady and ensure good lighting</li>
            </>
          ) : (
            <>
              <li>Hold phone 6-12 inches from barcode</li>
              <li>Keep barcode flat and centered</li>
            </>
          )}
          <li>Ensure good lighting (no shadows)</li>
          <li>Wait for camera to auto-focus</li>
        </ul>
      </div>
    </div>
  );
}
