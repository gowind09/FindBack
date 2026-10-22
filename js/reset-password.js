"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const requestForm = document.getElementById("recoveryRequestForm");
    const updateForm = document.getElementById("recoveryUpdateForm");
    const message = document.getElementById("recoveryMessage");
    if (!requestForm || !updateForm || !message) return;

    const showRecoveryForm = () => {
        requestForm.hidden = true;
        updateForm.hidden = false;
        message.textContent = "Enter and confirm your new password.";
    };

    if (!supabaseClient) {
        message.textContent = "FindBack could not connect. Reload the page and try again.";
        return;
    }

    supabaseClient.auth.onAuthStateChange(event => {
        if (event === "PASSWORD_RECOVERY") showRecoveryForm();
    });

    requestForm.addEventListener("submit", async event => {
        event.preventDefault();
        const button = document.getElementById("recoveryRequestBtn");
        button.disabled = true;
        message.textContent = "Sending reset link…";
        try {
            const redirectTo = new URL("reset-password.html", window.location.href).toString();
            const { error } = await supabaseClient.auth.resetPasswordForEmail(
                document.getElementById("recoveryEmail").value.trim(),
                { redirectTo }
            );
            if (error) throw error;
            message.textContent = "If an account uses that email, a password reset link is on its way.";
        } catch (error) {
            message.textContent = error.message || "Could not send the reset link. Please try again.";
        } finally {
            button.disabled = false;
        }
    });

    updateForm.addEventListener("submit", async event => {
        event.preventDefault();
        const password = document.getElementById("newPassword").value;
        const confirmation = document.getElementById("confirmNewPassword").value;
        if (password.length < 8) {
            message.textContent = "Use at least 8 characters for your new password.";
            return;
        }
        if (password !== confirmation) {
            message.textContent = "The passwords do not match.";
            return;
        }
        const button = document.getElementById("recoveryUpdateBtn");
        button.disabled = true;
        message.textContent = "Updating your password…";
        try {
            const { error } = await supabaseClient.auth.updateUser({ password });
            if (error) throw error;
            await supabaseClient.auth.signOut();
            window.location.replace("login.html?password=updated");
        } catch (error) {
            message.textContent = error.message || "Could not update your password.";
            button.disabled = false;
        }
    });
});
