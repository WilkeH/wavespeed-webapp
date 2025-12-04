import React, { useState, useRef } from "react";

// Hilfsfunktion: Bild-URLs aus der API-Antwort ziehen
const extractImageUrlsFromResponse = (response) => {
  if (!response) return [];
  const data = response.data ?? response;
  const outs = data?.outputs || data?.data?.outputs;
  if (Array.isArray(outs)) {
    return outs.filter((o) => typeof o === "string");
  }
  return [];
};

// Kleine Selbsttests für die Hilfsfunktion (nur Konsole)
const runExtractImageUrlsFromResponseTests = () => {
  try {
    const sampleResponse1 = {
      code: 200,
      message: "success",
      data: {
        outputs: [
          "https://example.com/image1.jpeg",
          "https://example.com/image2.jpeg",
        ],
      },
    };
    const urls1 = extractImageUrlsFromResponse(sampleResponse1);
    if (
      urls1.length !== 2 ||
      urls1[0] !== "https://example.com/image1.jpeg" ||
      urls1[1] !== "https://example.com/image2.jpeg"
    ) {
      console.warn("extractImageUrlsFromResponse test1 failed", urls1);
    }

    const sampleResponse2 = {
      data: {
        outputs: ["https://example.com/only.png"],
      },
    };
    const urls2 = extractImageUrlsFromResponse(sampleResponse2);
    if (urls2.length !== 1 || urls2[0] !== "https://example.com/only.png") {
      console.warn("extractImageUrlsFromResponse test2 failed", urls2);
    }

    const sampleResponse3 = {
      data: {
        data: {
          outputs: ["https://example.com/webp.webp", 123, null],
        },
      },
    };
    const urls3 = extractImageUrlsFromResponse(sampleResponse3);
    if (urls3.length !== 1 || urls3[0] !== "https://example.com/webp.webp") {
      console.warn("extractImageUrlsFromResponse test3 failed", urls3);
    }

    const sampleResponse4 = {
      data: {
        outputs: [],
      },
    };
    const urls4 = extractImageUrlsFromResponse(sampleResponse4);
    if (urls4.length !== 0) {
      console.warn("extractImageUrlsFromResponse test4 failed", urls4);
    }

    // völlig anderes Shape -> sollte leeres Array ergeben
    const sampleResponse5 = {
      status: "ok",
      result: {
        images: ["https://example.com/not-used.png"],
      },
    };
    const urls5 = extractImageUrlsFromResponse(sampleResponse5);
    if (urls5.length !== 0) {
      console.warn("extractImageUrlsFromResponse test5 failed", urls5);
    }
  } catch (e) {
    console.warn("extractImageUrlsFromResponse tests threw", e);
  }
};

runExtractImageUrlsFromResponseTests();

// API Keys
const wilkeKey =
  "92e486466c93d61f1239a303bf45a5e60abca31e1ee5ae5c2f8d773dace9aa5e";
const kimKey =
  "a1d43f411551c73e20390251c7428028c16f44cbf03bd2de7db98fe5c2402366";

const lensSize = 180;
const zoomFactor = 2.5;

function WavespeedSeedreamEditApp() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [keyFlash, setKeyFlash] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState([]);
  const [size, setSize] = useState("3072*4096");
  const [selectedRatio, setSelectedRatio] = useState(null);
  const [orientation, setOrientation] = useState("portrait");
  const [longSide, setLongSide] = useState("4096");
  const [isLoading, setIsLoading] = useState(false);
  const [activeButton, setActiveButton] = useState(null);
  const [error, setError] = useState(null);
  const [rawResponse, setRawResponse] = useState(null);
  const [galleryOutputs, setGalleryOutputs] = useState([]);
  const [lensActive, setLensActive] = useState(false);
  const [lensPos, setLensPos] = useState(null);

  const fileInputRef = useRef(null);
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);

  const handleFiles = (fileList) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const computeSizeFromRatio = (ratioW, ratioH) => {
    const long = parseInt(longSide || "0", 10);
    const effectiveLong = !isNaN(long) && long > 0 ? long : 4096;
    let w;
    let h;
    if (ratioW >= ratioH) {
      w = effectiveLong;
      h = Math.round((effectiveLong * ratioH) / ratioW);
    } else {
      h = effectiveLong;
      w = Math.round((effectiveLong * ratioW) / ratioH);
    }
    setSize(`${w}*${h}`);
  };

  const handleSubmitEndpoint = async (version) => {
    setError(null);
    setRawResponse(null);
    setActiveButton(version);

    const [wStr, hStr] = size.split("*");
    const w = parseInt(wStr, 10);
    const h = parseInt(hStr, 10);

    if (!isNaN(w) && !isNaN(h) && w * h < 921600) {
      setError(
        "Die gewählte Auflösung ist zu klein. Seedream benötigt mindestens 921600 Pixel."
      );
      setActiveButton(null);
      return;
    }

    if (!apiKey.trim()) {
      setError("Bitte wähle zuerst einen API-Key (Wilke oder Kim).");
      setActiveButton(null);
      return;
    }

    if (!prompt.trim()) {
      setError("Bitte schreibe einen Prompt.");
      setActiveButton(null);
      return;
    }

    const imagesFiltered = images.map((i) => i.trim()).filter(Boolean);
    if (imagesFiltered.length === 0) {
      setError("Bitte füge mindestens ein Referenzbild hinzu.");
      setActiveButton(null);
      return;
    }

    const endpoints = {
      v4: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4/edit",
      "v4.5": "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit",
    };

    const runRequest = async (url, tagVersion) => {
      const body = {
        prompt,
        images: imagesFiltered,
        size,
        enable_sync_mode: true,
        enable_base64_output: false,
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} – ${res.statusText}\n${text}`);
      }

      const data = await res.json();
      const urls = extractImageUrlsFromResponse(data);
      if (urls.length > 0) {
        setGalleryOutputs((prev) => [
          ...urls.map((u) => ({ url: u, version: tagVersion })),
          ...prev,
        ]);
      }
      return data;
    };

    setIsLoading(true);
    try {
      if (version === "both") {
        const [result4, result45] = await Promise.all([
          runRequest(endpoints.v4, "v4"),
          runRequest(endpoints["v4.5"], "v4.5"),
        ]);
        setRawResponse({ v4: result4, v4_5: result45 });
      } else {
        const data = await runRequest(endpoints[version], version);
        setRawResponse(data);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Fehler beim Request.");
    } finally {
      setIsLoading(false);
      setActiveButton(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSubmitEndpoint("v4");
  };

  const baseButtonClasses =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  const handleSelectWilke = () => {
    setApiKey(wilkeKey);
    setKeyFlash("wilke");
    setTimeout(() => setKeyFlash(null), 600);
  };

  const handleSelectKim = () => {
    setApiKey(kimKey);
    setKeyFlash("kim");
    setTimeout(() => setKeyFlash(null), 600);
  };

  const isWilkeActive = apiKey === wilkeKey;
  const isKimActive = apiKey === kimKey;

  const handleLensMove = (e) => {
    if (
      !lensActive ||
      !imageContainerRef.current ||
      !imageRef.current ||
      !selectedImage
    ) {
      return;
    }

    const containerRect = imageContainerRef.current.getBoundingClientRect();
    const imageRect = imageRef.current.getBoundingClientRect();

    const containerX = e.clientX - containerRect.left;
    const containerY = e.clientY - containerRect.top;

    const imageX = e.clientX - imageRect.left;
    const imageY = e.clientY - imageRect.top;

    setLensPos({ containerX, containerY, imageX, imageY });
  };

  // Lupe-Stil vorbereiten
  let lensStyle;
  if (lensActive && lensPos && imageRef.current) {
    const imgRect = imageRef.current.getBoundingClientRect();
    const bgWidth = imgRect.width * zoomFactor;
    const bgHeight = imgRect.height * zoomFactor;
    const bgPosX = -(lensPos.imageX * zoomFactor - lensSize / 2);
    const bgPosY = -(lensPos.imageY * zoomFactor - lensSize / 2);

    lensStyle = {
      width: lensSize,
      height: lensSize,
      left: lensPos.containerX - lensSize / 2,
      top: lensPos.containerY - lensSize / 2,
      position: "absolute",
      borderRadius: "9999px",
      border: "2px solid rgba(129, 140, 248, 0.8)",
      boxShadow: "0 10px 25px rgba(129, 140, 248, 0.4)",
      pointerEvents: "none",
      overflow: "hidden",
      backgroundImage: selectedImage ? `url(${selectedImage})` : undefined,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${bgWidth}px ${bgHeight}px`,
      backgroundPosition: `${bgPosX}px ${bgPosY}px`,
    };
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-4">
      {keyFlash && (
        <div
          className={`fixed inset-0 z-40 pointer-events-none flex items-center justify-center transition-opacity duration-500 ${
            keyFlash ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              keyFlash === "wilke"
                ? "rgba(37, 99, 235, 0.25)"
                : "rgba(236, 72, 153, 0.25)",
          }}
        >
          <div className="text-3xl font-bold tracking-wide drop-shadow-xl">
            {keyFlash === "wilke"
              ? "Wilke API aktiviert"
              : "Kim API aktiviert"}
          </div>
        </div>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => {
            setSelectedImage(null);
            setLensActive(false);
            setLensPos(null);
          }}
        >
          <div
            className={`relative max-w-4xl max-h-[90vh] w-full mx-4 rounded-2xl overflow-hidden bg-slate-900/80 border border-slate-700 ${
              lensActive ? "cursor-none" : "cursor-default"
            }`}
            onClick={(e) => e.stopPropagation()}
            ref={imageContainerRef}
            onMouseMove={handleLensMove}
          >
            <button
              type="button"
              className="absolute top-3 right-3 z-10 rounded-full bg-black/60 hover:bg-black/80 w-8 h-8 flex items-center justify-center text-sm transition-colors"
              onClick={() => {
                setSelectedImage(null);
                setLensActive(false);
                setLensPos(null);
              }}
            >
              ✕
            </button>
            <button
              type="button"
              className={`absolute top-3 right-12 z-10 rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors ${
                lensActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/50"
                  : "bg-black/60 text-slate-100 hover:bg-black/80"
              }`}
              onClick={() => setLensActive((prev) => !prev)}
            >
              🔍
            </button>
            <img
              ref={imageRef}
              onClick={() => setLensActive((prev) => !prev)}
              src={selectedImage}
              alt="Großansicht"
              className="h-[80vh] w-auto max-w-full object-contain mx-auto bg-black"
            />
            {lensActive && lensPos && lensStyle && (
              <div className="pointer-events-none" style={lensStyle} />
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Wavespeed API Key
              </p>
              <p className="text-[11px] text-slate-400">
                Wähle, mit welchem Account du generierst.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectWilke}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                  isWilkeActive
                    ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                Wilke
              </button>
              <button
                type="button"
                onClick={handleSelectKim}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                  isKimActive
                    ? "bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-500/40"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                Kim
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-300">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  placeholder="Beschreibe, wie Seedream dein Bild verändern soll..."
                  className="w-full rounded-xl bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-300">
                  Referenzbilder
                </label>
                <div
                  className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-3"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleFiles(e.dataTransfer.files);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <div className="flex flex-wrap gap-[4px] items-center">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center cursor-pointer hover:border-indigo-500 hover:scale-[1.03] hover:brightness-110 transition-all"
                        onClick={() => setSelectedImage(img)}
                      >
                        <img
                          src={img}
                          alt={`Referenz ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 text-[10px] bg-black/70 rounded-full px-1 hover:bg-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImages((prev) =>
                              prev.filter((_, i) => i !== idx)
                            );
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div
                      className="flex flex-col items-center justify-center w-16 h-16 rounded-lg bg-slate-900/40 border border-slate-700 text-slate-400 text-2xl font-bold hover:border-indigo-500 hover:scale-[1.03] transition-all cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      +
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Auflösung (Seitenverhältnis + lange Seite)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mt-1">
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-slate-400">
                    Längste Seite
                  </span>
                  <input
                    type="number"
                    min={256}
                    max={8192}
                    value={longSide}
                    onChange={(e) => setLongSide(e.target.value)}
                    placeholder="z.B. 4096"
                    className="h-[46px] rounded-xl bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 w-full transition-all duration-150 hover:bg-slate-800 hover:border-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-slate-400">
                    Ausrichtung
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOrientation((o) =>
                        o === "portrait" ? "landscape" : "portrait"
                      )
                    }
                    className="px-4 py-2 text-sm rounded-xl bg-slate-900 border border-indigo-500 flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:bg-slate-800 hover:border-indigo-400 hover:scale-[1.03]"
                  >
                    <span className="text-indigo-300 text-lg">
                      {orientation === "portrait" ? "↕" : "↔"}
                    </span>
                    <span className="text-slate-200 font-semibold tracking-wide">
                      {orientation === "portrait" ? "Hochkant" : "Querformat"}
                    </span>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-slate-400">
                    Seitenverhältnis
                  </span>
                  <div className="grid grid-cols-3 gap-2 w-full">
                    {[
                      orientation === "portrait"
                        ? { label: "1:1", w: 1, h: 1 }
                        : { label: "1:1", w: 1, h: 1 },
                      orientation === "portrait"
                        ? { label: "3:4", w: 3, h: 4 }
                        : { label: "4:3", w: 4, h: 3 },
                      orientation === "portrait"
                        ? { label: "4:5", w: 4, h: 5 }
                        : { label: "5:4", w: 5, h: 4 },
                      orientation === "portrait"
                        ? { label: "2:3", w: 2, h: 3 }
                        : { label: "3:2", w: 3, h: 2 },
                      orientation === "portrait"
                        ? { label: "9:16", w: 9, h: 16 }
                        : { label: "16:9", w: 16, h: 9 },
                      orientation === "portrait"
                        ? { label: "16:9", w: 16, h: 9 }
                        : { label: "9:16", w: 9, h: 16 },
                    ].map((ratio) => {
                      const isActive = selectedRatio === ratio.label;
                      return (
                        <button
                          key={ratio.label}
                          type="button"
                          className={`px-3 py-2 text-xs rounded-lg w-full flex items-center justify-center text-center transition-all duration-150 border ${
                            isActive
                              ? "bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-500/40 scale-[1.05]"
                              : "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-indigo-500 hover:scale-[1.03]"
                          }`}
                          onClick={() => {
                            setSelectedRatio(ratio.label);
                            computeSizeFromRatio(ratio.w, ratio.h);
                          }}
                        >
                          {ratio.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400 mt-1">
                Aktuelle Größe:{" "}
                <span className="text-indigo-400">{size}</span>
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/70 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSubmitEndpoint("v4")}
                className={`${baseButtonClasses} ${
                  isLoading
                    ? activeButton === "v4"
                      ? "bg-blue-600 animate-pulse"
                      : "bg-slate-900 opacity-40 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {isLoading && activeButton === "v4"
                  ? "Generiere v4…"
                  : "Seedream 4.0"}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSubmitEndpoint("v4.5")}
                className={`${baseButtonClasses} ${
                  isLoading
                    ? activeButton === "v4.5"
                      ? "bg-purple-600 animate-pulse"
                      : "bg-slate-900 opacity-40 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500"
                }`}
              >
                {isLoading && activeButton === "v4.5"
                  ? "Generiere v4.5…"
                  : "Seedream 4.5"}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSubmitEndpoint("both")}
                className={`${baseButtonClasses} ${
                  isLoading
                    ? activeButton === "both"
                      ? "bg-indigo-600 animate-pulse"
                      : "bg-slate-900 opacity-40 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {isLoading && activeButton === "both"
                  ? "Generiere beide…"
                  : "Beide Versionen"}
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl min-h-[260px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Galerie</h2>
              <span className="text-[11px] text-slate-500">
                Neueste oben · Klick zum Vergrößern
              </span>
            </div>

            {galleryOutputs.length === 0 ? (
              <div className="h-full min-h-[180px] flex items-center justify-center text-xs text-slate-500">
                Noch keine Bilder generiert.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {galleryOutputs.map((item, idx) => {
                  const borderColor =
                    item.version === "v4"
                      ? "border-blue-500/70"
                      : item.version === "v4.5"
                      ? "border-purple-500/70"
                      : "border-indigo-500/70";
                  const labelText =
                    item.version === "v4"
                      ? "Seedream v4"
                      : item.version === "v4.5"
                      ? "Seedream v4.5"
                      : "Beide";

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col items-center gap-2 border rounded-xl p-2 bg-slate-900/60 ${borderColor}`}
                    >
                      <div
                        className="w-full aspect-square rounded-lg overflow-hidden cursor-pointer group"
                        onClick={() => setSelectedImage(item.url)}
                      >
                        <img
                          src={item.url}
                          alt={`Seedream Result ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                        />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {labelText}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl max-h-72 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Rohe JSON-Antwort</h2>
              <span className="text-[10px] text-slate-500">
                Debug / Fallback
              </span>
            </div>

            {rawResponse ? (
              <pre className="text-[11px] leading-snug text-slate-300 whitespace-pre-wrap break-words">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">
                Noch kein Ergebnis. Sende einen Request, um die JSON-Antwort
                hier zu sehen.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WavespeedSeedreamEditApp;
