"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const requestForm = document.getElementById("resetRequestForm");
    const codeForm = document.getElementById("resetCodeForm");
    const passwordForm = document.getElementById("newPasswordForm");
    const channelSelect = document.getElementById("resetChannel");
    const emailField = document.getElementById("resetEmailField");
    const phoneField = document.getElementById("resetPhoneField");
    const emailInput = document.getElementById("resetEmail");
    const phoneInput = document.getElementById("resetPhone");
    const phoneEmailFallback = document.getElementById("phoneEmailFallback");
    const phoneFallbackEmail = document.getElementById("phoneFallbackEmail");
    const sendEmailFallback = document.getElementById("sendEmailFallback");
    const status = document.getElementById("resetStatus");
    const sendButton = document.getElementById("sendResetCode");
    const codeInput = document.getElementById("resetCode");
    const codeInstructions = document.getElementById("codeInstructions");
    const verifyButton = document.getElementById("verifyResetCode");
    const resendButton = document.getElementById("resendResetCode");
    const saveButton = document.getElementById("saveNewPassword");
    let challenge = null;
    let recoveryVerified = false;
    let resendRemaining = 0;
    let resendTimer = null;

    if (!requestForm || !codeForm || !passwordForm) return;

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("error", isError);
    }

    function showStage(stage) {
        requestForm.hidden = stage !== "request";
        codeForm.hidden = stage !== "code";
        passwordForm.hidden = stage !== "password";
    }

    function updateChannelFields() {
        const usePhone = channelSelect.value === "phone";
        emailField.hidden = usePhone;
        emailInput.disabled = usePhone;
        emailInput.required = !usePhone;
        phoneField.hidden = !usePhone;
        phoneInput.disabled = !usePhone;
        phoneInput.required = usePhone;
        if (!usePhone) {
            phoneEmailFallback.hidden = true;
            phoneFallbackEmail.disabled = true;
        }
        setStatus("");
    }

    function getSendErrorMessage(error) {
        const message = String(error?.message || "");
        if (channelSelect.value === "phone" && /signups? not allowed for otp/i.test(message)) {
            phoneEmailFallback.hidden = false;
            phoneFallbackEmail.disabled = false;
            phoneFallbackEmail.required = true;
            return "This number is not linked to a verified Supabase Auth phone account. Enter your account email below to continue recovery securely.";
        }
        if (channelSelect.value === "phone" && /sms.*(provider|config)|phone.*(provider|config)/i.test(message)) {
            return "SMS delivery is not configured for this project yet. Use Email recovery, or configure a Supabase Auth SMS provider first.";
        }
        return message || "Could not send a code. Please try again later.";
    }

    async function requestCode() {
        if (!supabaseClient) throw new Error("Supabase could not load. Check your connection and try again.");

        if (channelSelect.value === "phone") {
            const phone = phoneInput.value.trim();
            if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
                throw new Error("Enter a mobile number in international format, such as +919876543210.");
            }
            const { error } = await supabaseClient.auth.signInWithOtp({
                phone,
                options: { shouldCreateUser: false }
            });
            if (error) throw error;
            challenge = { channel: "phone", recipient: phone };
            codeInstructions.textContent = `Enter the six-digit SMS code sent to ${phone}.`;
        } else {
            const email = emailInput.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error("Enter a valid email address.");
            }
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
            if (error) throw error;
            challenge = { channel: "email", recipient: email };
            codeInstructions.textContent = `If ${email} belongs to a FindBack account, a six-digit recovery code has been sent. Enter it below.`;
        }

        codeInput.value = "";
        requestForm.hidden = true;
        codeForm.hidden = false;
        codeInput.focus();
        startResendCooldown();
        setStatus("");
    }

    channelSelect.addEventListener("change", updateChannelFields);
    updateChannelFields();

    sendEmailFallback.addEventListener("click", async () => {
        const email = phoneFallbackEmail.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatus("Enter a valid email address for your account.", true);
            phoneFallbackEmail.focus();
            return;
        }
        sendEmailFallback.disabled = true;
        try {
            if (!supabaseClient) throw new Error("Supabase could not load. Check your connection and try again.");
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
            if (error) throw error;
            challenge = { channel: "email", recipient: email };
            codeInput.value = "";
            codeInstructions.textContent = `If ${email} belongs to a FindBack account, a six-digit recovery code has been sent. Enter it below.`;
            showStage("code");
            codeInput.focus();
            startResendCooldown();
            setStatus("");
        } catch (error) {
            console.error("Could not send email recovery code:", error);
            setStatus(error.message || "Could not send the email recovery code.", true);
        } finally {
            sendEmailFallback.disabled = false;
        }
    });

    requestForm.addEventListener("submit", async event => {
        event.preventDefault();
        sendButton.disabled = true;
        setStatus("Sending your one-time code...");
        try {
            await requestCode();
        } catch (error) {
            console.error("Could not send password reset code:", error);
            setStatus(getSendErrorMessage(error), true);
        } finally {
            sendButton.disabled = false;
        }
    });

    resendButton.addEventListener("click", async () => {
        if (!challenge) return;
        resendButton.disabled = true;
        try {
            channelSelect.value = challenge.channel;
            updateChannelFields();
            if (challenge.channel === "email") emailInput.value = challenge.recipient;
            else phoneInput.value = challenge.recipient;
            await requestCode();
        } catch (error) {
            startResendCooldown();
            setStatus(error.message || "Could not resend the code.", true);
        } finally {
            resendButton.disabled = resendRemaining > 0;
        }
    });

    document.getElementById("changeResetRecipient").addEventListener("click", () => {
        challenge = null;
        window.clearInterval(resendTimer);
        codeForm.hidden = true;
        requestForm.hidden = false;
        setStatus("");
    });

    codeForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!challenge || !supabaseClient) return;
        const token = codeInput.value.trim();
        if (!/^\d{6}$/.test(token)) {
            setStatus("Enter the six-digit code.", true);
            return;
        }
        verifyButton.disabled = true;
        setStatus("Verifying your code...");
        try {
            const verification = challenge.channel === "email"
                ? await supabaseClient.auth.verifyOtp({ email: challenge.recipient, token, type: "recovery" })
                : await supabaseClient.auth.verifyOtp({ phone: challenge.recipient, token, type: "sms" });
            if (verification.error) throw verification.error;
            if (!verification.data?.session) throw new Error("The code was accepted, but no recovery session was created. Request a new code.");
            recoveryVerified = true;
            setStatus("");
            showStage("password");
            document.getElementById("resetNewPassword").focus();
        } catch (error) {
            console.error("Could not verify password reset code:", error);
            setStatus(error.message || "That code is invalid or expired. Request a new one.", true);
        } finally {
            verifyButton.disabled = false;
        }
    });

    passwordForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!recoveryVerified || !supabaseClient) {
            setStatus("Verify your one-time code before choosing a new password.", true);
            showStage("request");
            return;
        }
        const password = document.getElementById("resetNewPassword").value;
        const confirmation = document.getElementById("resetConfirmPassword").value;
        if (password.length < 8) {
            document.getElementById("newPasswordInstructions").textContent = "Use at least 8 characters for your new password.";
            return;
        }
        if (password !== confirmation) {
            document.getElementById("newPasswordInstructions").textContent = "The passwords do not match.";
            return;
        }

        saveButton.disabled = true;
        document.getElementById("newPasswordInstructions").textContent = "Updating your password...";
        try {
            const { error } = await supabaseClient.auth.updateUser({ password });
            if (error) throw error;
            document.getElementById("newPasswordInstructions").textContent = "Password updated. Returning to sign in...";
            recoveryVerified = false;
            try {
                await supabaseClient.auth.signOut();
            } catch (signOutError) {
                console.warn("Password changed, but the recovery session could not be cleared:", signOutError);
            }
            window.location.replace("login.html?password=updated");
        } catch (error) {
            console.error("Could not update password:", error);
            document.getElementById("newPasswordInstructions").textContent = error.message || "Could not update your password. Verify your code and try again.";
            saveButton.disabled = false;
        }
    });

    supabaseClient?.auth.onAuthStateChange(event => {
        if (event !== "PASSWORD_RECOVERY") return;
        recoveryVerified = true;
        setStatus("");
        showStage("password");
        document.getElementById("newPasswordInstructions").textContent = "Identity verified. Choose a new password.";
    });

    function startResendCooldown() {
        window.clearInterval(resendTimer);
        resendRemaining = 60;
        resendButton.disabled = true;
        resendButton.textContent = "Resend in 60s";
        resendTimer = window.setInterval(() => {
            resendRemaining -= 1;
            resendButton.textContent = resendRemaining > 0 ? `Resend in ${resendRemaining}s` : "Send another code";
            if (resendRemaining <= 0) {
                window.clearInterval(resendTimer);
                resendButton.disabled = false;
            }
        }, 1000);
    }
});
