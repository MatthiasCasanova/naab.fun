"use strict";

(function exposeClientUtils(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.GameClientUtils = api;
  }
})(typeof window !== "undefined" ? window : globalThis, () => {
  function normalizeServerUrl(configuredUrl, currentOrigin) {
    const rawUrl = String(configuredUrl || "").trim();
    const fallbackOrigin = String(currentOrigin || "").trim();
    const selectedUrl = rawUrl || fallbackOrigin;

    if (!selectedUrl) {
      throw new Error("Aucune URL de serveur n'est disponible.");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(selectedUrl);
    } catch {
      throw new Error(`URL de serveur invalide : "${selectedUrl}".`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(
        `Protocole non autorisé pour le serveur : "${parsedUrl.protocol}".`
      );
    }

    return parsedUrl.origin;
  }

  function buildEndpointUrl(serverUrl, endpointPath) {
    const normalizedPath = String(endpointPath || "").replace(/^\/+/, "");
    return new URL(normalizedPath, `${serverUrl}/`).href;
  }

  function describeError(error) {
    if (!error) {
      return "Erreur inconnue.";
    }

    if (error.name === "AbortError") {
      return "La requête a dépassé le délai autorisé.";
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }

  function normalizeVolume(value, fallback = 1) {
    if (value === null || value === undefined || value === "") {
      return Math.min(1, Math.max(0, Number(fallback) || 0));
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return Math.min(1, Math.max(0, Number(fallback) || 0));
    }

    return Math.min(1, Math.max(0, numericValue));
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getTimerLevel(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    if (safeSeconds < 10) {
      return "danger";
    }
    if (safeSeconds < 20) {
      return "warning";
    }
    return "normal";
  }

  function getRoundIntro(previousType) {
    if (previousType === "audio") {
      return "À ton avis, quel machin produit ce son ?";
    }
    if (previousType === "drawing") {
      return "Mais qu'est-ce que ce dessin est censé représenter ?";
    }
    if (previousType === "text") {
      return "Fais du bruit avec cette phrase, sans appeler la police.";
    }
    return "Invente un truc. La logique est facultative.";
  }

  return {
    buildEndpointUrl,
    describeError,
    formatTime,
    getRoundIntro,
    getTimerLevel,
    normalizeVolume,
    normalizeServerUrl
  };
});
