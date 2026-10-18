"use strict";

(() => {
    const BUCKET = "item-images";
    const URL_TTL_SECONDS = 300;
    const URL_CACHE_MS = 240000;
    const signedUrlCache = new Map();

    function getSupabaseClient() {
        return typeof supabaseClient === "undefined" ? null : supabaseClient;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function markup(path, alt, className = "") {
        if (!path) return "";
        return `<figure class="protected-photo ${escapeHTML(className)}" data-photo-viewer>
            <img src="" data-photo-path="${escapeHTML(path)}" alt="${escapeHTML(alt)}" draggable="false">
            <figcaption class="photo-viewer-status" role="status">Loading photo…</figcaption>
        </figure>`;
    }

    function setStatus(figure, message, canRetry = false, retry = null) {
        const status = figure.querySelector(".photo-viewer-status");
        if (!status) return;
        status.replaceChildren(document.createTextNode(message));
        if (canRetry && retry) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "photo-viewer-retry";
            button.textContent = "Retry";
            button.addEventListener("click", retry, { once: true });
            status.append(" ", button);
        }
        status.hidden = false;
    }

    function signedUrl(path, forceFresh = false) {
        const cached = signedUrlCache.get(path);
        if (!forceFresh && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);
        const client = getSupabaseClient();
        if (!client) return Promise.reject(new Error("Image service is unavailable."));
        return client.storage.from(BUCKET).createSignedUrl(path, URL_TTL_SECONDS).then(async ({ data, error }) => {
            if (error || !data?.signedUrl) {
                const accessError = error || new Error("Could not authorize this photo.");
                let user = null;
                try {
                    const authResult = await client.auth.getUser();
                    if (!authResult.error) user = authResult.data.user;
                } catch {
                    user = null;
                }
                const unauthenticated = !user;
                accessError.code = unauthenticated ? "AUTH_REQUIRED" : "PHOTO_FORBIDDEN";
                accessError.message = unauthenticated
                    ? "Sign in to view this photo."
                    : "You don't have permission to view this photo.";
                throw accessError;
            }
            signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + URL_CACHE_MS });
            return data.signedUrl;
        });
    }

    async function loadImage(image, forceFresh = false) {
        const figure = image.closest("[data-photo-viewer]");
        const path = image.dataset.photoPath;
        if (!figure || !path) return;
        figure.classList.remove("is-loaded", "has-error");
        setStatus(figure, forceFresh ? "Refreshing secure photo link…" : "Loading photo…");
        try {
            const url = await signedUrl(path, forceFresh);
            image.onload = () => {
                figure.classList.add("is-loaded");
                figure.classList.remove("has-error");
                const status = figure.querySelector(".photo-viewer-status");
                if (status) status.hidden = true;
            };
            image.onerror = async () => {
                image.onerror = null;
                if (image.dataset.refreshed !== "true") {
                    image.dataset.refreshed = "true";
                    setStatus(figure, "Photo link expired. Refreshing…");
                    await loadImage(image, true);
                    return;
                }
                figure.classList.add("has-error");
                setStatus(figure, "Photo could not be loaded.", true, () => {
                    image.dataset.refreshed = "false";
                    loadImage(image, true);
                });
            };
            image.src = url;
        } catch (error) {
            figure.classList.add("has-error");
            const forbidden = error.code === "AUTH_REQUIRED" || error.code === "PHOTO_FORBIDDEN";
            setStatus(figure, forbidden ? error.message : "Photo unavailable.", !forbidden, () => loadImage(image, true));
        }
    }

    function protect(root = document) {
        const figures = [];
        if (root.matches?.("[data-photo-viewer]")) figures.push(root);
        const descendants = root.querySelectorAll ? root.querySelectorAll("[data-photo-viewer]") : [];
        figures.push(...descendants);
        figures.forEach(figure => {
            if (figure.dataset.photoProtected === "true") return;
            figure.dataset.photoProtected = "true";
            figure.addEventListener("contextmenu", event => event.preventDefault());
            figure.addEventListener("dragstart", event => event.preventDefault());
            const image = figure.querySelector("img[data-photo-path]");
            if (image) loadImage(image);
        });
    }

    window.FindBackPhotoViewer = { markup, protect };
    document.addEventListener("DOMContentLoaded", () => protect(document));
    getSupabaseClient()?.auth.onAuthStateChange(event => {
        signedUrlCache.clear();
        if (event !== "SIGNED_OUT") return;
        document.querySelectorAll("[data-photo-viewer]").forEach(figure => {
            const image = figure.querySelector("img[data-photo-path]");
            image?.removeAttribute("src");
            figure.classList.remove("is-loaded");
            setStatus(figure, "Sign in to view this photo.");
        });
    });
})();
