"use strict";

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".password-toggle[data-target]").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.target);
            if (!input) return;

            const showing = input.type === "password";
            input.type = showing ? "text" : "password";
            button.textContent = showing ? "Hide" : "Show";
            button.setAttribute("aria-pressed", String(showing));
            button.setAttribute("aria-label", `${showing ? "Hide" : "Show"} ${input.labels?.[0]?.textContent || "password"}`);
        });
    });
});
