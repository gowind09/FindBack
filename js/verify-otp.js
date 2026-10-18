"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("verifyOtpForm");
    if (!form) return;
    const emailInput = document.getElementById("verifyEmail");
    const inputs = [...document.querySelectorAll(".otp-digit")];
    const message = document.getElementById("verifyOtpMessage");
    const countdown = document.getElementById("otpCountdown");
    const verifyButton = document.getElementById("verifyOtpButton");
    const resendButton = document.getElementById("resendOtpButton");
    emailInput.focus();

    let resendRemaining = 60;
    let timer;
    startCountdown();

    inputs.forEach((input, index) => {
        input.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "").slice(0, 6);
            if (digits.length > 1) {
                digits.split("").forEach((digit, digitIndex) => { inputs[digitIndex].value = digit; });
                inputs[Math.min(digits.length, inputs.length) - 1].focus();
                return;
            }
            input.value = digits;
            if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
        });
        input.addEventListener("keydown", event => {
            if (event.key === "Backspace" && !input.value && index > 0) inputs[index - 1].focus();
            if (event.key === "ArrowLeft" && index > 0) inputs[index - 1].focus();
            if (event.key === "ArrowRight" && index < inputs.length - 1) inputs[index + 1].focus();
        });
        input.addEventListener("paste", event => {
            const pasted = event.clipboardData?.getData("text")?.replace(/\D/g, "").slice(0, 6);
            if (!pasted) return;
            event.preventDefault();
            pasted.split("").forEach((digit, digitIndex) => { inputs[digitIndex].value = digit; });
            inputs[Math.min(pasted.length, inputs.length) - 1].focus();
        });
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const token = inputs.map(input => input.value).join("");
        if (!supabaseClient) return setMessage("Supabase could not load. Check your connection and try again.", true);
        if (!/^\d{6}$/.test(token)) return setMessage("Enter all six digits from the email.", true);
        verifyButton.disabled = true;
        resendButton.disabled = true;
        setMessage("Verifying your code...");
        try {
            const { data, error } = await supabaseClient.auth.verifyOtp({ email, token, type: "email" });
            if (error) throw error;
            if (!data?.session || !data?.user?.email_confirmed_at) {
                throw new Error("Email verification did not establish a verified session. Request a new code and try again.");
            }
            if (window.FindBackProfilePhoto) {
                try {
                    await window.FindBackProfilePhoto.uploadPending(data.user.id);
                } catch (photoError) {
                    console.error("Profile photo upload failed after email verification:", photoError);
                    setMessage("Your email is verified, but the profile photo could not be uploaded. You can continue to FindBack.", true);
                    window.setTimeout(() => window.location.replace("home.html"), 2200);
                    return;
                }
            }
            window.location.replace("home.html");
        } catch (error) {
            console.error("Email OTP verification error:", error);
            setMessage(error.message || "That code is invalid or expired. Request a new one.", true);
            resendButton.disabled = resendRemaining > 0;
        } finally {
            verifyButton.disabled = false;
        }
    });

    resendButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage("Enter the email address used to sign up.", true);
        if (!supabaseClient) return setMessage("Supabase could not load. Check your connection and try again.", true);
        resendButton.disabled = true;
        setMessage("Sending a new verification code...");
        try {
            const { error } = await supabaseClient.auth.resend({ type: "signup", email });
            if (error) throw error;
            inputs.forEach(input => { input.value = ""; });
            startCountdown();
            setMessage("If this address has a pending signup, a new verification code has been sent.");
            inputs[0].focus();
        } catch (error) {
            console.error("Could not resend email OTP:", error);
            startCountdown();
            setMessage(error.message || "Could not resend the code. Please wait and try again.", true);
        }
    });

    function startCountdown() {
        window.clearInterval(timer);
        resendRemaining = 60;
        resendButton.disabled = true;
        updateCountdown();
        timer = window.setInterval(() => {
            resendRemaining -= 1;
            updateCountdown();
            if (resendRemaining <= 0) {
                window.clearInterval(timer);
                resendButton.disabled = false;
            }
        }, 1000);
    }

    function updateCountdown() {
        countdown.textContent = resendRemaining > 0
            ? `You can request another code in ${resendRemaining} seconds.`
            : "You can request a new code now.";
    }

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.classList.toggle("error", isError);
    }
});
