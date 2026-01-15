"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with html5-qrcode
const BarcodeScanner = dynamic(() => import("./components/BarcodeScanner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent"></div>
    </div>
  ),
});

interface ScannedItem {
  barcode: string;
  format: string;
  timestamp: Date;
  category?: string;
}

// Bottle size categories based on common Thai products
function getBottleSize(barcode: string): {
  size: string;
  tokens: number;
  co2: string;
} {
  // This is a mock - in real app, you'd lookup the barcode in a database
  // For demo, we'll use barcode length and pattern to guess

  // Default to medium size
  return { size: "M", tokens: 2, co2: "25g" };
}

function getCategoryFromFormat(format: string): string {
  // In real app, you'd lookup barcode in product database
  // For demo, assume PET bottle
  return "🍶 PET Bottle";
}

export default function Home() {
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lastScan, setLastScan] = useState<ScannedItem | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleScanSuccess = (barcode: string, format: string) => {
    // Check for duplicates in last 3 seconds
    const isDuplicate = scannedItems.some(
      (item) =>
        item.barcode === barcode &&
        new Date().getTime() - item.timestamp.getTime() < 3000
    );

    if (isDuplicate) return;

    const newItem: ScannedItem = {
      barcode,
      format,
      timestamp: new Date(),
      category: getCategoryFromFormat(format),
    };

    setLastScan(newItem);
    setScannedItems((prev) => [newItem, ...prev]);
    setShowSuccess(true);

    // Play success sound (if available)
    try {
      const audio = new Audio("/beep.mp3");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}

    // Vibrate on mobile
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    // Hide success message after 2 seconds
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const clearHistory = () => {
    setScannedItems([]);
    setLastScan(null);
  };

  const totalTokens = scannedItems.reduce((sum) => sum + 2, 0); // 2 tokens per item (demo)

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                🌱
              </div>
              <div>
                <h1 className="text-xl font-bold">GreenLoop</h1>
                <p className="text-green-100 text-xs">Recycle-to-Earn</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{totalTokens}</div>
              <div className="text-green-100 text-xs">Tokens</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Success Toast */}
        {showSuccess && lastScan && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-green-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2">
              <span className="text-xl">✅</span>
              <span className="font-semibold">+2 Tokens!</span>
            </div>
          </div>
        )}

        {/* Scanner Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-xl">📷</span>
              Barcode Scanner
            </h2>
            <p className="text-green-100 text-sm mt-1">
              Scan product barcode on bottles or cans
            </p>
          </div>
          <div className="p-4">
            <BarcodeScanner
              onScanSuccess={handleScanSuccess}
              onScanError={(err) => console.error(err)}
            />
          </div>
        </div>

        {/* Last Scanned Item */}
        {lastScan && (
          <div className="bg-white rounded-2xl shadow-xl p-4">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>🎯</span> Last Scanned
            </h3>
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-2xl mb-1">{lastScan.category}</div>
                  <div className="font-mono text-sm text-gray-600 bg-white px-2 py-1 rounded">
                    {lastScan.barcode}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Format: {lastScan.format}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">+2</div>
                  <div className="text-xs text-gray-500">Tokens</div>
                  <div className="text-xs text-emerald-600 mt-1">~25g CO₂</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scan History */}
        {scannedItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span>📝</span> Scan History ({scannedItems.length})
              </h3>
              <button
                onClick={clearHistory}
                className="text-red-500 text-sm hover:text-red-600"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {scannedItems.map((item, index) => (
                <div
                  key={`${item.barcode}-${item.timestamp.getTime()}`}
                  className="flex justify-between items-center bg-gray-50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">
                      {item.category?.split(" ")[0]}
                    </div>
                    <div>
                      <div className="font-mono text-xs text-gray-600">
                        {item.barcode}
                      </div>
                      <div className="text-xs text-gray-400">
                        {item.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-green-600 font-semibold">+2</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-200">
          <h3 className="font-semibold text-blue-700 flex items-center gap-2 mb-2">
            <span>ℹ️</span> Supported Barcodes
          </h3>
          <ul className="text-sm text-blue-600 space-y-1">
            <li>• EAN-13 / EAN-8 (Product barcodes)</li>
            <li>• UPC-A / UPC-E (US product codes)</li>
            <li>• Code-128 / Code-39</li>
            <li>• QR Codes</li>
          </ul>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-green-600">
              {scannedItems.length}
            </div>
            <div className="text-xs text-gray-500">Items</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-emerald-600">
              {totalTokens}
            </div>
            <div className="text-xs text-gray-500">Tokens</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-teal-600">
              {scannedItems.length * 25}g
            </div>
            <div className="text-xs text-gray-500">CO₂ Saved</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-md mx-auto px-4 py-6 text-center text-gray-500 text-sm">
        <p>🌱 GreenLoop - POC Barcode Scanner</p>
        <p className="text-xs mt-1">Powered by html5-qrcode</p>
      </footer>
    </div>
  );
}
