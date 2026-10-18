/* =========================================================
   FINDBACK - LOST & FOUND PORTAL
   Frontend JavaScript
   ========================================================= */

"use strict";

/* =========================
   STORAGE KEYS
========================= */

const LOGIN_KEY = "findback_logged_in";
const ITEM_IMAGES_BUCKET = "item-images";
let itemsCache = [];
let itemsLoadPromise = null;
let currentUserId = null;


/* =========================
   BASIC UTILITIES
========================= */

function getItems() {
    return itemsCache;
}

function escapeHTML(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(date) {

    if (!date) {
        return "Not specified";
    }

    const d = new Date(date + "T00:00:00");

    if (isNaN(d.getTime())) {
        return date;
    }

    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


/* =========================
   TOAST NOTIFICATION
========================= */

function showToast(message, type = "success") {

    let toast = document.getElementById("findbackToast");

    if (!toast) {

        toast = document.createElement("div");

        toast.id = "findbackToast";

        toast.style.cssText = `
            position: fixed;
            right: 25px;
            bottom: 25px;
            z-index: 99999;
            padding: 14px 20px;
            border-radius: 10px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            max-width: 350px;
        `;

        document.body.appendChild(toast);
    }

    if (type === "error") {
        toast.style.background = "#dc2626";
    } 
    else if (type === "warning") {
        toast.style.background = "#d97706";
    } 
    else {
        toast.style.background = "#16a34a";
    }

    toast.textContent = message;

    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    clearTimeout(window.findbackToastTimer);

    window.findbackToastTimer = setTimeout(() => {

        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";

    }, 3000);
}


/* =========================
   IMAGE PREVIEW
========================= */

function setupImagePreview() {
    const imageInput = document.getElementById("photo");
    const preview = document.getElementById("preview");
    const previewImage = document.getElementById("previewImage");
    const dropZone = document.getElementById("imageDropZone");
    if (!imageInput) return;

    function showPreview(file) {
        if (!file) {
            if (preview) preview.style.display = "none";
            return false;
        }
        if (!file.type.startsWith("image/")) {
            showToast("Please select a valid image.", "error");
            imageInput.value = "";
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast("Image size must be below 5MB.", "error");
            imageInput.value = "";
            return false;
        }

        const reader = new FileReader();
        reader.onload = event => {
            if (previewImage) previewImage.src = event.target.result;
            if (preview) preview.style.display = "block";
        };
        reader.readAsDataURL(file);
        return true;
    }

    imageInput.addEventListener("change", function () {
        showPreview(this.files[0]);
    });

    if (!dropZone) return;
    dropZone.addEventListener("click", event => {
        if (event.target !== imageInput) imageInput.click();
    });
    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            imageInput.click();
        }
    });
    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add("is-dragging");
        });
    });
    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove("is-dragging");
        });
    });
    dropZone.addEventListener("drop", event => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        imageInput.files = transfer.files;
        showPreview(file);
    });
}

async function loadItems() {
    if (!supabaseClient) {
        return { user: null, error: new Error("Supabase did not load. Check your internet connection, then reload this page.") };
    }
    if (itemsLoadPromise) return itemsLoadPromise;
    itemsLoadPromise = (async () => {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            currentUserId = null;
            itemsCache = [];
            return { user: null, error: authError };
        }
        currentUserId = user.id;

        const { data, error } = await supabaseClient
            .from("items")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) {
            itemsCache = [];
            return { user, error };
        }

        itemsCache = (data || []).map(row => {
            return {
                id: row.id,
                trackingId: row.tracking_id || row.id,
                type: row.item_type,
                itemName: row.item_name,
                category: row.category || "",
                location: row.location || "",
                date: row.item_date || "",
                description: row.description || "",
                contactName: row.contact_name || "",
                email: row.contact_email || "",
                phone: row.contact_phone || "",
                photo: row.image_url || "",
                status: row.status,
                createdAt: row.created_at,
                userId: row.user_id
            };
        });
        return { user, error: null };
    })().finally(() => { itemsLoadPromise = null; });
    return itemsLoadPromise;
}


/* =========================
   REPORT LOST / FOUND ITEM
========================= */

function setupReportForm() {

    const lostForm =
        document.getElementById("lostForm");

    const foundForm =
        document.getElementById("foundForm");

    const form = lostForm || foundForm;

    if (!form) return;

    const itemType =
        lostForm ? "lost" : "found";

    const categorySelect = document.getElementById("category");
    const customCategoryInput = document.getElementById("customCategory");
    categorySelect?.addEventListener("change", () => {
        const useCustomCategory = categorySelect.value === "Other";
        customCategoryInput.hidden = !useCustomCategory;
        customCategoryInput.disabled = !useCustomCategory;
        customCategoryInput.required = useCustomCategory;
        if (useCustomCategory) customCategoryInput.focus();
        else customCategoryInput.value = "";
    });
    form.addEventListener("reset", () => {
        customCategoryInput.hidden = true;
        customCategoryInput.disabled = true;
        customCategoryInput.required = false;
    });


    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const itemName = document.getElementById("itemName")?.value.trim();
        const selectedCategory = categorySelect?.value;
        const category = selectedCategory === "Other"
            ? customCategoryInput?.value.trim()
            : selectedCategory;
        const location = document.getElementById("location")?.value.trim();
        const dateField = document.getElementById(itemType === "lost" ? "dateLost" : "dateFound");
        const description = document.getElementById("description")?.value.trim();
        const photoInput = document.getElementById("photo");

        if (!itemName || !category || !location || !dateField?.value || !description) {
            showToast("Please fill all required fields.", "error");
            return;
        }

        if (!supabaseClient) {
            showToast("Supabase could not load. Check your connection and try again.", "error");
            return;
        }
        let user;
        try {
            const { data, error: authError } = await supabaseClient.auth.getUser();
            if (authError) throw authError;
            user = data.user;
        } catch (error) {
            showToast(error.message || "Could not verify your sign-in. Please try again.", "error");
            return;
        }
        if (!user) {
            showToast("Please log in before submitting an item report.", "error");
            return;
        }

        const submitButton = form.querySelector(".submit-btn");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
        }

        let uploadedPath = null;
        try {
            const { data: profile, error: profileError } = await supabaseClient
                .from("profiles")
                .select("full_name,email,phone")
                .eq("id", user.id)
                .maybeSingle();
            if (profileError) throw profileError;
            if (!profile?.full_name || !profile?.email) {
                throw new Error("Please complete your name and email in your profile before reporting an item.");
            }

            const file = photoInput?.files?.[0];
            if (file) {
                const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[file.type];
                if (!extension) throw new Error("Use a JPG, PNG, WEBP, or GIF image.");
                uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await supabaseClient.storage
                    .from(ITEM_IMAGES_BUCKET)
                    .upload(uploadedPath, file, { contentType: file.type, upsert: false });
                if (uploadError) throw uploadError;
            }

            const { data: row, error: insertError } = await supabaseClient
                .from("items")
                .insert({
                    user_id: user.id,
                    item_type: itemType,
                    item_name: itemName,
                    category,
                    location,
                    item_date: dateField.value,
                    description,
                    contact_name: profile.full_name,
                    contact_email: profile.email,
                    contact_phone: profile.phone || null,
                    image_url: uploadedPath,
                    status: "active"
                })
                .select()
                .single();
            if (insertError) throw insertError;

            const { error: loadError } = await loadItems();
            if (loadError) console.error("Report saved, but list refresh failed:", loadError);
            const success = document.getElementById("successMessage");
            if (success) {
                success.style.display = "block";
                success.innerHTML = `<strong>${itemType === "lost" ? "Lost" : "Found"} item reported successfully!</strong><br>Tracking ID: <strong>${escapeHTML(row.tracking_id || row.id)}</strong>`;
            }
            showToast(`${itemType === "lost" ? "Lost" : "Found"} item reported successfully!`);
            form.reset();
            document.getElementById("preview").style.display = "none";
            document.getElementById("previewImage").src = "";
            renderItems();
            renderMyReports();
        } catch (error) {
            console.error("Item report error:", error);
            if (uploadedPath) await supabaseClient.storage.from(ITEM_IMAGES_BUCKET).remove([uploadedPath]);
            showToast(error.message || "Could not submit the item report.", "error");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = itemType === "lost" ? "Submit Lost Item" : "Submit Found Item";
            }
        }
    });
}


/* =========================
   SEARCH SYSTEM
========================= */

function setupSearch() {

    const searchInput =
        document.getElementById(
            "lostItemSearch"
        ) ||
        document.getElementById(
            "foundItemSearch"
        );

    if (!searchInput) return;


    let results =
        document.getElementById(
            "findbackResults"
        );


    if (!results) {

        results =
            document.createElement("section");

        results.id =
            "findbackResults";

        results.style.cssText = `
            max-width:1100px;
            margin:40px auto;
            padding:0 20px;
        `;


        const searchSection =
            document.querySelector(
                ".search-section"
            );

        if (searchSection) {

            searchSection.after(results);

        } 
        else {

            document.body.appendChild(
                results
            );

        }

    }


    function search() {

        renderItems(
            searchInput.value
        );
        renderMyReports(searchInput.value);

    }


    searchInput.addEventListener(
        "input",
        search
    );


    searchInput.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                search();

            }

        }
    );


    const searchButton =
        document.querySelector(
            ".search-btn"
        );


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            search
        );

    }


    loadItems().then(({ user, error }) => {
        if (error) {
            console.error("Could not load reports:", error);
            showToast("Could not load reports from Supabase.", "error");
            return;
        }
        if (!user) {
            results.innerHTML = `<div class="items-login-prompt">Sign in to browse lost and found reports. <a href="login.html">Log in</a> or <a href="sign-up.html">create an account</a>.</div>`;
            renderMyReports(searchInput.value);
            return;
        }
        renderItems(searchInput.value);
        renderMyReports(searchInput.value);
    });

}


/* =========================
   DISPLAY ITEMS
========================= */

function renderItems(searchTerm = "") {

    const container =
        document.getElementById(
            "findbackResults"
        );

    if (!container) return;


    const lostPage =
        !!document.getElementById(
            "lostForm"
        );

    const foundPage =
        !!document.getElementById(
            "foundForm"
        );


    let targetType = null;


    /*
        lost page:
        show FOUND items

        found page:
        show LOST items
    */

    if (lostPage) {
        targetType = "found";
    }

    if (foundPage) {
        targetType = "lost";
    }


    let items =
        getItems();


    if (targetType) {

        items =
            items.filter(item =>
                item.type === targetType &&
                item.status === "active"
            );

    }


    const term =
        searchTerm
            .trim()
            .toLowerCase();


    if (term) {

        items =
            items.filter(item => {

                const text = [

                    item.itemName,

                    item.category,

                    item.location,

                    item.description

                ]
                    .join(" ")
                    .toLowerCase();


                return text.includes(term);

            });

    }


    if (!lostPage && !foundPage) {
        return;
    }


    container.innerHTML = `

        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:20px;
            gap:10px;
        ">

            <h2 style="
                margin:0;
                color:#111827;
            ">

                ${
                    targetType === "found"
                        ? "Found Items"
                        : "Lost Items"
                }

            </h2>

            <span style="
                color:#64748b;
                font-size:14px;
            ">

                ${items.length}
                item${items.length !== 1 ? "s" : ""}

            </span>

        </div>


        ${
            items.length
                ? `
                    <div style="
                        display:grid;
                        grid-template-columns:
                        repeat(auto-fit,minmax(280px,320px));
                        gap:20px;
                        justify-content: start;
                    ">

                        ${items
                            .map(createCard)
                            .join("")}

                    </div>
                  `
                :
                  `
                    <div style="
                        background:white;
                        border:1px solid #e5e7eb;
                        border-radius:12px;
                        padding:40px;
                        text-align:center;
                    ">

                        <div style="
                            font-size:45px;
                        ">
                            🔎
                        </div>

                        <h3>
                            No items found
                        </h3>

                        <p style="
                            color:#64748b;
                        ">
                            Try another search.
                        </p>

                    </div>
                  `
        }

    `;

    window.FindBackPhotoViewer?.protect(container);


    /* DETAILS BUTTON */

    container
        .querySelectorAll(
            "[data-view-id]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                function () {

                    const item =
                        getItems().find(
                            x =>
                                x.id ===
                                this.dataset.viewId
                        );

                    if (item) {
                        showItemDetails(item);
                    }

                }
            );

        });

}


/* =========================
   ITEM CARD
========================= */

function createCard(item) {

    const image =
        item.photo
            ? window.FindBackPhotoViewer.markup(item.photo, item.itemName, "item-card-photo")

            : `
                <div style="
                    height:180px;
                    border-radius:10px;
                    background:#eff6ff;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:50px;
                    margin-bottom:15px;
                ">
                    📦
                </div>
              `;


    return `

        <div style="
            background:white;
            border:1px solid #e5e7eb;
            border-radius:14px;
            padding:16px;
            box-shadow:
                0 5px 15px
                rgba(0,0,0,0.06);
        ">

            ${image}


            <span style="
                display:inline-block;
                padding:5px 10px;
                border-radius:20px;
                font-size:11px;
                font-weight:bold;

                background:
                ${
                    item.type === "lost"
                        ? "#fee2e2"
                        : "#dcfce7"
                };

                color:
                ${
                    item.type === "lost"
                        ? "#b91c1c"
                        : "#166534"
                };
            ">

                ${
                    item.type === "lost"
                        ? "LOST"
                        : "FOUND"
                }

            </span>


            <h3 style="
                margin:12px 0 8px;
            ">

                ${escapeHTML(
                    item.itemName
                )}

            </h3>


            <p style="
                color:#64748b;
                margin:6px 0;
            ">

                <strong>
                    Category:
                </strong>

                ${escapeHTML(
                    item.category
                )}

            </p>


            <p style="
                color:#64748b;
                margin:6px 0;
            ">

                <strong>
                    Location:
                </strong>

                ${escapeHTML(
                    item.location
                )}

            </p>


            <p style="
                color:#64748b;
                margin:6px 0 15px;
            ">

                <strong>
                    Date:
                </strong>

                ${formatDate(
                    item.date
                )}

            </p>


            <button
                type="button"
                data-view-id="${item.id}"
                style="
                    width:100%;
                    padding:11px;
                    border:0;
                    border-radius:8px;
                    background:#2563eb;
                    color:white;
                    cursor:pointer;
                    font-weight:600;
                "
            >

                View Details

            </button>

        </div>

    `;
}


/* =========================
   ITEM DETAILS MODAL
========================= */

function showItemDetails(item) {

    closeModal();


    const modal =
        document.createElement("div");

    modal.id =
        "findbackModal";


    modal.innerHTML = `

        <div style="
            position:fixed;
            inset:0;
            background:
                rgba(15,23,42,.65);
            z-index:99999;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:20px;
        ">

            <div style="
                width:min(650px,100%);
                max-height:90vh;
                overflow:auto;
                background:white;
                border-radius:16px;
                padding:25px;
                position:relative;
            ">


                <button
                    id="closeModal"
                    style="
                        position:absolute;
                        right:15px;
                        top:15px;
                        width:35px;
                        height:35px;
                        border:0;
                        border-radius:50%;
                        background:#f1f5f9;
                        font-size:20px;
                        cursor:pointer;
                    "
                >
                    ×
                </button>


                ${
                    item.photo
                        ? window.FindBackPhotoViewer.markup(item.photo, item.itemName, "item-detail-photo")
                        : ""
                }


                <span style="
                    display:inline-block;
                    padding:5px 10px;
                    border-radius:20px;
                    background:
                    ${
                        item.type === "lost"
                            ? "#fee2e2"
                            : "#dcfce7"
                    };
                    color:
                    ${
                        item.type === "lost"
                            ? "#b91c1c"
                            : "#166534"
                    };
                    font-size:12px;
                    font-weight:bold;
                ">

                    ${
                        item.type === "lost"
                            ? "LOST ITEM"
                            : "FOUND ITEM"
                    }

                </span>

                ${item.userId === currentUserId ? `<p><strong>Status:</strong> ${escapeHTML(item.status || "active")}</p>` : ""}


                <h2>

                    ${escapeHTML(
                        item.itemName
                    )}

                </h2>


                <p>
                    <strong>
                        Category:
                    </strong>
                    ${escapeHTML(
                        item.category
                    )}
                </p>


                <p>
                    <strong>
                        Location:
                    </strong>
                    ${escapeHTML(
                        item.location
                    )}
                </p>


                <p>
                    <strong>
                        Date:
                    </strong>
                    ${formatDate(
                        item.date
                    )}
                </p>


                <p>
                    <strong>
                        Tracking ID:
                    </strong>
                    ${escapeHTML(
                        item.trackingId
                    )}
                </p>


                <hr>


                <h3>
                    Description
                </h3>


                <p style="
                    color:#475569;
                ">

                    ${escapeHTML(
                        item.description
                    )}

                </p>


                <hr>


                <h3>
                    Contact Information
                </h3>


                <p>
                    <strong>
                        Name:
                    </strong>

                    ${escapeHTML(
                        item.contactName
                    )}
                </p>


                <p>

                    <strong>
                        Email:
                    </strong>

                    <a href="mailto:${escapeHTML(
                        item.email
                    )}">

                        ${escapeHTML(
                            item.email
                        )}

                    </a>

                </p>


                ${
                    item.phone
                        ? `
                            <p>

                                <strong>
                                    Phone:
                                </strong>

                                <a href="tel:${escapeHTML(
                                    item.phone
                                )}">

                                    ${escapeHTML(
                                        item.phone
                                    )}

                                </a>

                            </p>
                          `
                        : ""
                }


                ${item.userId === currentUserId ? `
                <button id="editItem" style="width:100%;margin-top:20px;padding:12px;border:0;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Edit Report</button>` : ""}

                ${item.userId === currentUserId && item.status === "active" ? `
                <button
                    id="resolveItem"
                    style="
                        width:100%;
                        margin-top:20px;
                        padding:12px;
                        border:0;
                        border-radius:8px;
                        background:#16a34a;
                        color:white;
                        font-weight:600;
                        cursor:pointer;
                    "
                >

                    Mark as Resolved

                </button>` : ""}

            </div>

        </div>

    `;


    document.body.appendChild(modal);
    window.FindBackPhotoViewer?.protect(modal);


    document
        .getElementById("closeModal")
        ?.addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById("resolveItem")
        ?.addEventListener(
            "click",
            function () {

                resolveItem(item.id).then(closeModal);

            }
        );

    document.getElementById("editItem")?.addEventListener("click", () => showEditReportForm(item));


    modal
        .firstElementChild
        .addEventListener(
            "click",
            function (event) {

                if (
                    event.target ===
                    this
                ) {

                    closeModal();

                }

            }
        );

}


/* =========================
   CLOSE MODAL
========================= */

function closeModal() {

    const modal =
        document.getElementById(
            "findbackModal"
        );

    if (modal) {
        modal.remove();
    }

}


/* =========================
   RESOLVE ITEM
========================= */

async function resolveItem(id) {
    const item = getItems().find(saved => saved.id === id);
    if (!item) return;
    if (item.userId !== currentUserId) {
        showToast("Only the person who reported this item can resolve it.", "error");
        return;
    }

    const { data, error } = await supabaseClient
        .from("items")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
    if (error || !data) {
        showToast(error?.message || "You can only resolve your own reports.", "error");
        return;
    }

    item.status = "resolved";
    showToast("Item marked as resolved!");
    renderItems();
    renderMyReports();
}

function showEditReportForm(item) {
    if (!item || item.userId !== currentUserId) {
        showToast("Only the person who reported this item can edit it.", "error");
        return;
    }
    closeModal();
    const modal = document.createElement("div");
    modal.id = "findbackModal";
    modal.innerHTML = `<div class="item-edit-backdrop"><form id="editReportForm" class="item-edit-form">
        <button type="button" id="closeEditReport" class="item-edit-close" aria-label="Close">×</button>
        <h2>Edit your report</h2>
        <label for="editItemName">Item name</label><input id="editItemName" maxlength="120" required value="${escapeHTML(item.itemName)}">
        <label for="editCategory">Category</label><input id="editCategory" maxlength="80" required value="${escapeHTML(item.category)}">
        <label for="editLocation">Location</label><input id="editLocation" maxlength="200" required value="${escapeHTML(item.location)}">
        <label for="editItemDate">Date</label><input id="editItemDate" type="date" required value="${escapeHTML(item.date)}">
        <label for="editDescription">Description</label><textarea id="editDescription" maxlength="3000" required>${escapeHTML(item.description)}</textarea>
        <div class="item-edit-actions"><button type="button" id="cancelEditReport">Cancel</button><button type="submit" id="saveEditReport">Save changes</button></div>
    </form></div>`;
    document.body.appendChild(modal);
    const close = () => closeModal();
    modal.querySelector("#closeEditReport")?.addEventListener("click", close);
    modal.querySelector("#cancelEditReport")?.addEventListener("click", close);
    modal.querySelector(".item-edit-backdrop")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) close();
    });
    modal.querySelector("#editReportForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        if (item.userId !== currentUserId) {
            showToast("Only the person who reported this item can edit it.", "error");
            return;
        }
        const button = modal.querySelector("#saveEditReport");
        button.disabled = true;
        try {
            const updated = {
                item_name: modal.querySelector("#editItemName").value.trim(),
                category: modal.querySelector("#editCategory").value.trim(),
                location: modal.querySelector("#editLocation").value.trim(),
                item_date: modal.querySelector("#editItemDate").value,
                description: modal.querySelector("#editDescription").value.trim()
            };
            if (Object.values(updated).some(value => !value)) throw new Error("Please complete all report fields.");
            const { data, error } = await supabaseClient.from("items").update(updated)
                .eq("id", item.id).eq("user_id", currentUserId).select("id").maybeSingle();
            if (error || !data) throw error || new Error("The report could not be updated.");
            const { error: refreshError } = await loadItems();
            if (refreshError) throw refreshError;
            closeModal();
            const input = document.getElementById("lostItemSearch") || document.getElementById("foundItemSearch");
            renderItems(input?.value || "");
            renderMyReports(input?.value || "");
            showToast("Report updated.");
        } catch (error) {
            console.error("Could not update report:", error);
            button.disabled = false;
            showToast(error.message || "Could not update your report.", "error");
        }
    });
}

function renderMyReports(searchTerm = "") {
    const container = document.getElementById("myReportsResults");
    if (!container) return;
    if (!currentUserId) {
        container.innerHTML = `<p class="items-login-prompt">Sign in to view and edit your reports. <a href="login.html">Log in</a>.</p>`;
        return;
    }
    const term = searchTerm.trim().toLowerCase();
    const reports = getItems().filter(item => item.userId === currentUserId && (!term ||
        [item.itemName, item.category, item.location, item.description].join(" ").toLowerCase().includes(term)));
    container.innerHTML = reports.length
        ? `<div class="my-reports-grid">${reports.map(createCard).join("")}</div>`
        : `<p class="my-reports-empty">You have no reports${term ? " matching this search" : " yet"}.</p>`;
    container.querySelectorAll("[data-view-id]").forEach(button => {
        button.addEventListener("click", () => {
            const item = reports.find(report => report.id === button.dataset.viewId);
            if (item) showItemDetails(item);
        });
    });
}


/* =========================
   LOGIN
========================= */

function setupLogin() {
  const loginForm = document.getElementById("loginForm");

  if (!loginForm) return;

  const loginMessage = document.getElementById("loginMessage");
  const resetForm = document.getElementById("passwordResetForm");
  const resetMessage = document.getElementById("passwordResetMessage");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const signupState = new URLSearchParams(window.location.search).get("signup");
  if (signupState === "check-email" && loginMessage) {
    loginMessage.textContent = "Your account is ready. Verify your email before signing in.";
  } else if (signupState === "complete" && loginMessage) {
    loginMessage.textContent = "Your account is ready. Sign in to continue.";
  }
  if (new URLSearchParams(window.location.search).get("password") === "updated" && loginMessage) {
    loginMessage.textContent = "Password updated. Sign in with your new password.";
  }

  forgotPasswordLink?.addEventListener("click", async event => {
    event.preventDefault();
    window.location.href = forgotPasswordLink.href;
  });

  resetForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmNewPassword").value;
    const resetButton = document.getElementById("passwordResetBtn");
    if (password.length < 8) {
      if (resetMessage) resetMessage.textContent = "Use at least 8 characters for your new password.";
      return;
    }
    if (password !== confirmation) {
      if (resetMessage) resetMessage.textContent = "The passwords do not match.";
      return;
    }
    if (!supabaseClient) {
      if (resetMessage) resetMessage.textContent = "Supabase could not load. Check your connection and try again.";
      return;
    }

    resetButton.disabled = true;
    if (resetMessage) resetMessage.textContent = "Updating password...";
    let updateError;
    try {
      ({ error: updateError } = await supabaseClient.auth.updateUser({ password }));
    } catch (error) {
      updateError = error;
    }
    resetButton.disabled = false;
    if (updateError) {
      if (resetMessage) resetMessage.textContent = updateError.message || "Could not update your password.";
      return;
    }
    if (resetMessage) resetMessage.textContent = "Password updated. Returning to sign in...";
    try { await supabaseClient.auth.signOut(); } catch (error) { console.warn("Could not clear the recovered session:", error); }
    window.location.replace("login.html?password=updated");
  });

  if (supabaseClient && resetForm) {
    supabaseClient.auth.onAuthStateChange(event => {
      if (event !== "PASSWORD_RECOVERY") return;
      loginForm.hidden = true;
      resetForm.hidden = false;
      if (resetMessage) resetMessage.textContent = "Enter a new password for your account.";
    });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const phone = document.getElementById("phone")?.value.trim() || "";
    const termsAccepted = document.getElementById("termsAccepted")?.checked;
    const message = document.getElementById("loginMessage");
    const loginBtn = document.getElementById("loginBtn");

    if (message) message.textContent = "";
    if (!termsAccepted) {
      if (message) message.textContent = "Please agree to the Terms and Conditions to continue.";
      return;
    }
    if (phone && !/^\+?[0-9\s()\-]{7,20}$/.test(phone)) {
      if (message) message.textContent = "Please enter a valid phone number.";
      return;
    }
    if (loginBtn) loginBtn.disabled = true;

    try {
      if (!supabaseClient) throw new Error("Supabase could not load. Check your internet connection and reload the page.");
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          ...(phone ? { phone } : {}),
          terms_accepted_at: new Date().toISOString(),
          terms_version: "2026-09-26"
        })
        .eq("id", data.user.id)
        .select("id")
        .maybeSingle();
      if (profileError) console.error("Profile details were not updated:", profileError);

      const { data: roleData, error: roleError } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (roleError) console.error("Signed in, but account role lookup failed:", roleError);
      const destination = ["admin", "super_admin", "president"].includes(roleData?.role)
        ? "FBPU-admin.html"
        : "index.html";
      window.location.replace(destination);
    } catch (error) {
      console.error("Login error:", error);
      if (message) {
        message.textContent = error.message || "Login failed.";
      } else {
        alert(error.message || "Login failed.");
      }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });
}


/* =========================
   CONTACT FORM
========================= */

function setupContactForm() {

    const form =
        document.querySelector(
            ".contact-form"
        );


    if (!form) return;


    form.addEventListener("submit", async event => {
        event.preventDefault();
        const name = document.getElementById("name")?.value.trim();
        const email = document.getElementById("email")?.value.trim();
        const subject = document.getElementById("subject")?.value.trim();
        const message = document.getElementById("message")?.value.trim();
        if (!name || !email || !subject || !message) {
            showToast("Please fill all fields.", "error");
            return;
        }
        if (!supabaseClient) {
            showToast("The feedback service is unavailable. Please try again later.", "error");
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const { data: { user } = {}, error: authError } = await supabaseClient.auth.getUser();
            if (authError) throw authError;
            const { error } = await supabaseClient.from("contact_messages").insert({
                user_id: user?.id || null,
                name,
                email,
                subject,
                message
            });
            if (error) throw error;
            form.reset();
            showToast("Feedback sent successfully!");
        } catch (error) {
            console.error("Contact form submission failed:", error);
            showToast(error.message || "Could not send your message. Please try again.", "error");
        } finally {
            if (button) button.disabled = false;
        }
    });

}


/* =========================
   LOGOUT
========================= */

function logout() {

    localStorage.removeItem(
        LOGIN_KEY
    );

    showToast(
        "Logged out successfully!"
    );


    setTimeout(
        function () {

            window.location.href =
                "login.html";

        },
        700
    );

}


/* =========================
   CHECK LOGIN
========================= */

function checkLogin() {

    const loggedIn =
        localStorage.getItem(
            LOGIN_KEY
        );


    /*
        Add class="protected-page"
        to body if you want a page
        to require login.
    */

    if (
        document.body.classList
            .contains("protected-page")
    ) {

        if (!loggedIn) {

            window.location.href =
                "login.html";

        }

    }

}


/* =========================
   ACTIVE NAVIGATION
========================= */

function setupNavigation() {

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    document
        .querySelectorAll("nav a")
        .forEach(link => {

            const href =
                link.getAttribute(
                    "href"
                );


            if (
                href &&
                href
                    .split("/")
                    .pop()
                    .toLowerCase() ===
                currentPage
            ) {

                link.classList.add(
                    "active"
                );

            }

        });

}


/* =========================
   ESC KEY MODAL
========================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape"
        ) {

            closeModal();

        }

    }
);


/* =========================
   PAGE INITIALIZATION
========================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        setupImagePreview();

        setupReportForm();

        setupSearch();

        setupLogin();

        setupContactForm();

        setupNavigation();

        checkLogin();

    }
);
