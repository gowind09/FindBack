"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const slot = document.getElementById("authSlot");
    if (!slot || typeof supabaseClient === "undefined" || !supabaseClient) return;
    if (slot.dataset.authInitialized === "true") return;
    slot.dataset.authInitialized = "true";
    let renderVersion = 0;

    const makeLink = (href, label, className = "") => {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        if (className) link.className = className;
        return link;
    };

    async function renderAuthSlot() {
        const version = ++renderVersion;
        slot.replaceChildren();
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (version !== renderVersion) return;
        if (error || !user) {
            document.querySelector('[data-admin-dashboard-link="true"]')?.remove();
            slot.append(makeLink("login.html", "Log in", "login"));
            slot.append(makeLink("sign-up.html", "Sign up", "signin"));
            return;
        }

        if (window.FindBackProfilePhoto) {
            try { await window.FindBackProfilePhoto.uploadPending(user.id); }
            catch (photoError) { console.warn("Pending profile photo upload will be retried later.", photoError); }
        }

        const { data: profile } = await supabaseClient
            .from("profiles")
            .select("full_name,email,phone,avatar_path")
            .eq("id", user.id)
            .maybeSingle();
        if (version !== renderVersion) return;

        const { data: roleData } = await supabaseClient
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
        if (version !== renderVersion) return;
        if (["admin", "super_admin", "president"].includes(roleData?.role)) {
            const nav = document.querySelector("header nav");
            if (nav && !nav.querySelector('[data-admin-dashboard-link="true"]')) {
                const dashboard = makeLink("FBPU-admin.html", "Admin Dashboard", "nav-link");
                dashboard.dataset.adminDashboardLink = "true";
                nav.append(dashboard);
            }
        } else {
            document.querySelector('[data-admin-dashboard-link="true"]')?.remove();
        }

        const menu = document.createElement("details");
        menu.className = "profile-menu";
        const summary = document.createElement("summary");
        summary.setAttribute("aria-label", "Open your profile menu");
        const avatar = document.createElement("span");
        avatar.className = "profile-avatar";
        avatar.textContent = (profile?.full_name || user.email || "U").trim().charAt(0).toUpperCase();
        if (profile?.avatar_path) {
            const { data: photoData } = await supabaseClient.storage.from("item-images").createSignedUrl(profile.avatar_path, 3600);
            if (version !== renderVersion) return;
            if (photoData?.signedUrl) {
                avatar.style.backgroundImage = `url("${photoData.signedUrl}")`;
                avatar.classList.add("has-profile-photo");
                avatar.textContent = "";
                avatar.setAttribute("aria-label", "Profile photo");
            }
        }
        summary.append(avatar);

        const panel = document.createElement("div");
        panel.className = "profile-panel";
        const heading = document.createElement("h2");
        heading.textContent = "Your profile";
        panel.append(heading);

        const form = document.createElement("form");
        form.className = "profile-form";
        const name = addField(form, "Full name", "text", profile?.full_name || "", "name");
        const email = addField(form, "Email", "email", profile?.email || user.email || "", "email");
        email.disabled = true;
        const phone = addField(form, "Phone number", "tel", profile?.phone || "", "tel");
        const photoField = document.createElement("label");
        photoField.className = "profile-photo-field";
        const photoLabel = document.createElement("span");
        photoLabel.textContent = profile?.avatar_path ? "Change profile picture" : "Add profile picture";
        const photoInput = document.createElement("input");
        photoInput.type = "file";
        photoInput.accept = "image/jpeg,image/png,image/webp,image/gif";
        photoInput.setAttribute("aria-label", "Add or change profile picture");
        photoField.append(photoLabel, photoInput);
        form.append(photoField);
        const status = document.createElement("p");
        status.className = "profile-status";
        status.setAttribute("role", "status");
        photoInput.addEventListener("change", async () => {
            const file = photoInput.files?.[0];
            if (!file) return;
            if (!window.FindBackProfilePhoto?.validate(file)) {
                status.textContent = "Choose a JPG, PNG, WebP, or GIF image up to 5 MB.";
                photoInput.value = "";
                return;
            }
            photoInput.disabled = true;
            photoLabel.textContent = "Uploading picture...";
            status.textContent = "";
            try {
                const path = await window.FindBackProfilePhoto.upload(user.id, file);
                const { data: photoData, error: photoError } = await supabaseClient.storage.from("item-images").createSignedUrl(path, 3600);
                if (photoError || !photoData?.signedUrl) throw photoError || new Error("Could not display the uploaded picture.");
                avatar.style.backgroundImage = `url("${photoData.signedUrl}")`;
                avatar.classList.add("has-profile-photo");
                avatar.textContent = "";
                avatar.setAttribute("aria-label", "Profile photo");
                photoLabel.textContent = "Change profile picture";
                status.textContent = "Profile picture updated.";
            } catch (photoError) {
                photoLabel.textContent = profile?.avatar_path ? "Change profile picture" : "Add profile picture";
                status.textContent = photoError.message || "Could not update the profile picture.";
            } finally {
                photoInput.disabled = false;
                photoInput.value = "";
            }
        });
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "profile-save-btn";
        save.textContent = "Save profile";
        form.append(status, save);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const phoneValue = phone.value.trim();
            if (phoneValue && !/^\+?[0-9\s()\-]{7,20}$/.test(phoneValue)) {
                status.textContent = "Please enter a valid phone number.";
                return;
            }
            save.disabled = true;
            status.textContent = "Saving...";
            const { data, error: updateError } = await supabaseClient
                .from("profiles")
                .update({ full_name: name.value.trim(), phone: phoneValue || null })
                .eq("id", user.id)
                .select("id")
                .maybeSingle();
            save.disabled = false;
            if (updateError || !data) {
                status.textContent = updateError?.message || "Profile was not updated.";
                return;
            }
            avatar.textContent = (name.value.trim() || user.email || "U").charAt(0).toUpperCase();
            status.textContent = "Profile saved.";
        });
        panel.append(form);

        const terms = makeLink("terms.html", "Terms and Conditions", "profile-terms-link");
        panel.append(terms);
        const signOut = document.createElement("button");
        signOut.type = "button";
        signOut.className = "profile-signout-btn";
        signOut.textContent = "Sign out";
        signOut.addEventListener("click", async () => {
            const { error: signOutError } = await supabaseClient.auth.signOut();
            if (signOutError) {
                status.textContent = signOutError.message;
                return;
            }
            window.location.href = "home.html";
        });
        panel.append(signOut);
        menu.append(summary, panel);
        slot.replaceChildren(menu);
    }

    function addField(form, labelText, type, value, autocomplete) {
        const wrapper = document.createElement("label");
        wrapper.className = "profile-field";
        wrapper.append(document.createTextNode(labelText));
        const input = document.createElement("input");
        input.type = type;
        input.value = value;
        input.autocomplete = autocomplete;
        input.required = type === "text";
        wrapper.append(input);
        form.append(wrapper);
        return input;
    }

    renderAuthSlot();
    supabaseClient.auth.onAuthStateChange(() => {
        window.setTimeout(renderAuthSlot, 0);
    });
});
