"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signupForm");
    const signupBtn = document.getElementById("signupBtn");
    const signupMessage = document.getElementById("signupMessage");
    const password = document.getElementById("password");
    const confirmPassword = document.getElementById("confirmPassword");
    if (!signupForm || !signupBtn || !signupMessage) return;

    signupForm.addEventListener("submit", async event => {
        event.preventDefault();
        const fullName = document.getElementById("fullName").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const email = document.getElementById("email").value.trim();
        const acceptedTerms = document.getElementById("termsAccepted").checked;
        const profilePhoto = document.getElementById("profilePhoto")?.files?.[0] || null;

        if (!acceptedTerms) return setMessage("Please agree to the Terms and Conditions to continue.", true);
        if (profilePhoto && !window.FindBackProfilePhoto?.validate(profilePhoto)) {
            return setMessage("Choose a JPG, PNG, WebP, or GIF image up to 5 MB.", true);
        }
        if (phone && !/^\+?[0-9\s()\-]{7,20}$/.test(phone)) return setMessage("Please enter a valid phone number.", true);
        if (password.value.length < 8) return setMessage("Use at least 8 characters for your password.", true);
        if (password.value !== confirmPassword.value) return setMessage("Passwords do not match.", true);
        if (!supabaseClient) return setMessage("Supabase could not load. Check your internet connection and reload the page.", true);

        signupBtn.disabled = true;
        signupBtn.textContent = "Creating Account...";
        setMessage("");
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password: password.value,
                options: {
                    data: {
                        full_name: fullName,
                        phone: phone || null,
                        terms_accepted_at: new Date().toISOString(),
                        terms_version: "2026-09-26"
                    }
                }
            });
            if (error) throw error;
            if (!data.user) throw new Error("Supabase did not return a new user. Please try again.");

            if (profilePhoto) {
                try { await window.FindBackProfilePhoto.savePending(profilePhoto); }
                catch (photoError) {
                    console.warn("Could not retain the optional profile photo for verification:", photoError);
                    setMessage("Your account can still be created, but the selected photo could not be saved.", true);
                }
            }

            // Supabase creates the profile and user role from its auth.users trigger.
            // With Confirm email enabled, signup returns no session until the OTP is verified.
            if (data.session) {
                if (profilePhoto) {
                    try { await window.FindBackProfilePhoto.uploadPending(data.user.id); }
                    catch (photoError) { console.warn("Profile photo will be retried after signup:", photoError); }
                }
                window.location.replace("index.html");
                return;
            }
            window.location.assign("verify-otp.html");
        } catch (error) {
            console.error("Signup error:", error);
            setMessage(error.message || "Unable to create account.", true);
        } finally {
            signupBtn.disabled = false;
            signupBtn.textContent = "Create Account";
        }
    });

    function setMessage(message, isError = false) {
        signupMessage.textContent = message;
        signupMessage.classList.toggle("auth-error", isError);
    }
});
