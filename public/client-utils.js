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

  return {
    buildEndpointUrl,
    describeError,
    normalizeServerUrl
  };
});
